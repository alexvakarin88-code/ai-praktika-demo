importScripts("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");

function cellValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return "";
  const value = cell.v;
  if (value instanceof Date) return value.toISOString();
  if (cell.t === "e") return String(value ?? "");
  return value ?? "";
}
function isBlank(value) {
  return value === "" || value === null || value === undefined;
}
self.onmessage = async (event) => {
  try {
    const file = event.data.file;
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
    for (let c = range.s.c; c <= range.e.c; c++) {
      let name = String(cellValue(sheet, headerRow, c)).trim() || "Колонка " + (c - range.s.c + 1);
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) name += " (" + seen[name] + ")";
      columns.push(name);
    }
    if (!columns.length) throw new Error("Не удалось определить столбцы таблицы.");
    const makeRow = (r) => {
      const row = {};
      let hasValue = false;
      for (let i = 0; i < columns.length; i++) {
        const value = cellValue(sheet, r, range.s.c + i);
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
    self.postMessage({ type: "meta", columns, totalRows, sheetName });
    const chunkSize = 150;
    let chunk = [];
    let chunkIndex = 0;
    let processedRows = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const row = makeRow(r);
      if (!row) continue;
      chunk.push(row);
      processedRows++;
      if (chunk.length >= chunkSize) {
        self.postMessage({ type: "chunk", rows: chunk, chunkIndex, processedRows, totalRows });
        chunk = [];
        chunkIndex++;
      }
    }
    if (chunk.length) {
      self.postMessage({ type: "chunk", rows: chunk, chunkIndex, processedRows, totalRows });
      chunkIndex++;
    }
    self.postMessage({ type: "done", totalRows, chunkCount: chunkIndex, sheetName });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Ошибка чтения файла." });
  }
};