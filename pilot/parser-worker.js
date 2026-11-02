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
function getCell(sheet, rowIndex, columnIndex) {
  const denseData = sheet["!data"] || sheet;
  const denseRow = denseData[rowIndex];
  if (Array.isArray(denseRow)) return denseRow[columnIndex];
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

let pendingAcks = new Map();
let nextRequestId = 1;
function sendAndWait(message) {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++;
    pendingAcks.set(requestId, { resolve, reject });
    self.postMessage({ ...message, requestId });
  });
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "ack") {
    const pending = pendingAcks.get(message.requestId);
    if (pending) {
      pendingAcks.delete(message.requestId);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message);
    }
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
  if (!self.crypto?.subtle) throw new Error("Браузер не поддерживает проверку целостности файла. Откройте приложение в актуальном браузере.");
  const digest = await self.crypto.subtle.digest("SHA-256", buffer);
  const fileHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге нет листов.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) throw new Error("Первый лист пуст.");

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerRow = range.s.r;
  const columns = [];
  const seen = Object.create(null);
  for (let c = range.s.c; c <= range.e.c; c++) {
    let name = String(cellValueFromCell(getCell(sheet, headerRow, c))).trim() || "Колонка " + (c - range.s.c + 1);
    seen[name] = (seen[name] || 0) + 1;
    if (seen[name] > 1) name += " (" + seen[name] + ")";
    columns.push(name);
  }
  if (!columns.length) throw new Error("Не удалось определить столбцы таблицы.");

  const makeRow = (r) => {
    const row = {};
    let hasValue = false;
    for (let i = 0; i < columns.length; i++) {
      const value = cellValueFromCell(getCell(sheet, r, range.s.c + i));
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

  const metaAck = await sendAndWait({
    type: "meta", columns, totalRows, sheetName, fileHash,
    fileName: file.name, fileSize: file.size, fileLastModified: file.lastModified
  });
  const skipSet = new Set(metaAck.skipChunkIndexes || []);

  // Keep each PostgREST request below the API payload ceiling and use a
  // three-request window to avoid one network round-trip per batch.
  const maxRows = 2000;
  const maxBytes = 2 * 1024 * 1024;
  const maxInFlight = 3;
  const encoder = new TextEncoder();
  let chunk = [];
  let chunkBytes = 0;
  let chunkIndex = 0;
  let processedRows = 0;
  let inFlight = [];

  const flushChunk = async () => {
    if (!chunk.length) return;
    const currentRows = chunk;
    const currentIndex = chunkIndex;
    const currentRowCount = currentRows.length;
    chunk = [];
    chunkBytes = 0;
    chunkIndex++;

    if (!skipSet.has(currentIndex)) {
      inFlight.push(sendAndWait({
        type: "chunk",
        rows: currentRows,
        rowCount: currentRowCount,
        chunkIndex: currentIndex,
        processedRows,
        totalRows
      }));
    }
    if (inFlight.length >= maxInFlight) {
      await Promise.all(inFlight);
      inFlight = [];
      self.postMessage({ type: "progress", processedRows, totalRows, chunkCount: chunkIndex });
    }
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
  if (inFlight.length) await Promise.all(inFlight);
  self.postMessage({ type: "progress", processedRows, totalRows, chunkCount: chunkIndex });
  self.postMessage({ type: "done", totalRows, chunkCount: chunkIndex, sheetName, fileHash });
}
