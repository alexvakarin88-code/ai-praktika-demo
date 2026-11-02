importScripts("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");

function cellValueFromCell(cell) {
  if (!cell) return "";
  const value = cell.v;
  if (value instanceof Date) return value.toISOString();
  if (cell.t === "e") return String(value ?? "");
  return value ?? "";
}
function isBlank(value) {
  return value === "" || value === null || value === undefined;
}

let pendingAck = null;
function sendAndWait(message) {
  return new Promise((resolve, reject) => {
    pendingAck = (ack) => {
      pendingAck = null;
      if (ack && ack.error) reject(new Error(ack.error));
      else resolve(ack);
    };
    self.postMessage(message);
  });
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "ack") {
    if (pendingAck) pendingAck(message);
    return;
  }
  if (message.file) {
    processFile(message.file).catch((error) => {
      self.postMessage({
        type: "error",
        message: error?.message || "Ошибка чтения файла."
      });
    });
  }
};

async function processFile(file) {
  if (!file) throw new Error("Файл не передан обработчику.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге нет листов.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) throw new Error("Первый лист пуст.");

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerRow = range.s.r;
  const columns = [];
  const seen = Object.create(null);
  // Precompute Excel column letters once; avoid encoding a cell address for every value.
  const columnKeys = [];
  for (let c = range.s.c; c <= range.e.c; c++) columnKeys.push(XLSX.utils.encode_col(c));

  for (let c = range.s.c; c <= range.e.c; c++) {
    let name = String(cellValueFromCell(sheet[columnKeys[c - range.s.c] + (headerRow + 1)])).trim() || "Колонка " + (c - range.s.c + 1);
    seen[name] = (seen[name] || 0) + 1;
    if (seen[name] > 1) name += " (" + seen[name] + ")";
    columns.push(name);
  }
  if (!columns.length) throw new Error("Не удалось определить столбцы таблицы.");

  const makeRow = (r) => {
    const row = {};
    let hasValue = false;
    for (let i = 0; i < columns.length; i++) {
      const value = cellValueFromCell(sheet[columnKeys[i] + (r + 1)]);
      row[columns[i]] = value;
      if (!isBlank(value)) hasValue = true;
    }
    return hasValue ? row : null;
  };

  let totalRows = 0;
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    if (makeRow(r)) totalRows++;
  }
  if (!totalRows) throw new Error("В первом листе нет строк с данными.");

  await sendAndWait({ type: "meta", columns, totalRows, sheetName });

  // Larger batches reduce the number of sequential network round-trips.
  // Keep a 2 MB payload ceiling for stable uploads on ordinary connections.
  const maxRows = 2000;
  const maxBytes = 2 * 1024 * 1024;
  const encoder = new TextEncoder();
  let chunk = [];
  let chunkBytes = 0;
  let chunkIndex = 0;
  let processedRows = 0;

  const flushChunk = async () => {
    if (!chunk.length) return;
    await sendAndWait({
      type: "chunk",
      rows: chunk,
      chunkIndex,
      processedRows,
      totalRows
    });
    chunk = [];
    chunkBytes = 0;
    chunkIndex++;
  };

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row = makeRow(r);
    if (!row) continue;

    const serialized = JSON.stringify(row);
    const rowBytes = encoder.encode(serialized).length + 1;
    if (rowBytes > 512 * 1024) {
      throw new Error("Одна строка таблицы слишком большая для безопасной загрузки (более 512 КБ). Проверьте ячейки с длинным текстом.");
    }
    if (chunk.length && (chunk.length >= maxRows || chunkBytes + rowBytes > maxBytes)) {
      await flushChunk();
    }

    chunk.push(row);
    chunkBytes += rowBytes;
    processedRows++;
  }

  await flushChunk();
  self.postMessage({ type: "done", totalRows, chunkCount: chunkIndex, sheetName });
}