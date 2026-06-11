const STORAGE_KEY = "shishi_delivery_web_v1";
const BRAND_NAME = "事事洗护";
const SCHOOL_NAMES = [
  "师大",
  "财大",
  "农大",
  "医大",
  "工大",
  "理工",
  "福大",
  "厦大",
  "集大",
  "华大",
  "闽大"
];
const CAMPUS_SUFFIXES = ["东区", "西区", "南区", "北区", "新区", "老区", "主校区", "校区", "龙文苑"];
const CAMPUSES = [
  "师大东区",
  "师大西区",
  "师大龙文苑",
  "财大东区",
  "财大西区",
  "农大东区",
  "农大西区",
  "厦大翔安校区"
];
const REQUIRED_COLUMNS = [
  "订单号",
  "姓名",
  "电话",
  "收货地址",
  "商品名称",
  "规格",
  "数量",
  "状态",
  "所属商家",
  "退款状态",
  "退款金额",
  "下单时间",
  "付款时间",
  "配送方式",
  "表单信息"
];
const NOTE_SHORTCUTS = ["电话无人接", "地址不清", "不在宿舍", "客户改时间", "图片无法打开", "楼栋识别错误"];
const STATUS_LIST = ["待取件", "已取到", "未找到", "异常"];
const DORM_CATALOG = buildDormCatalog();
const WASH_MERCHANT_KEYWORDS = ["洗护"];

let state = loadState();
let activeTab = "pickup";

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#fileInput");
const restoreInput = $("#restoreInput");
const batchSelect = $("#batchSelect");
const searchInput = $("#searchInput");

function emptyState() {
  return { activeBatchId: "", batches: [], orderStates: {} };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyState();
  } catch {
    return emptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePhone(value) {
  const text = normalizeText(value);
  return /^\d+\.0$/.test(text) ? text.slice(0, -2) : text;
}

function compactText(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[零〇]/g, "0")
    .replace(/[一壹]/g, "1")
    .replace(/[二贰两]/g, "2")
    .replace(/[三叁]/g, "3")
    .replace(/[四肆]/g, "4")
    .replace(/[五伍]/g, "5")
    .replace(/[六陆]/g, "6")
    .replace(/[七柒]/g, "7")
    .replace(/[八捌]/g, "8")
    .replace(/[九玖]/g, "9")
    .replace(/[\s:：,，;；\-—_（）()、]+/g, "");
}

function buildDormCatalog() {
  const entries = [];
  const add = (school, campus, building) => entries.push({ school, campus, building });
  const addRange = (school, campus, start, end, prefix = "", suffix = "栋") => {
    for (let index = start; index <= end; index += 1) add(school, campus, `${prefix}${index}${suffix}`);
  };

  addRange("师大", "东区", 1, 18);
  addRange("师大", "龙文苑", 1, 9);
  addRange("师大", "西区", 1, 8);
  add("师大", "西区", "9A栋");
  add("师大", "西区", "9B栋");

  ["玉兰苑", "丹桂苑", "樱花苑"].forEach((area) => addRange("财大", "西区", 1, area === "玉兰苑" ? 5 : 4, area));
  addRange("财大", "西区", 1, 3, "翠竹苑");
  add("财大", "西区", "D17栋");
  addRange("财大", "东区", 1, 4, "文心苑");

  addRange("民大", "南区", 1, 17);
  addRange("民大", "北区", 1, 8);

  addRange("贵中医", "宿舍区", 1, 4, "橘园");
  addRange("贵中医", "宿舍区", 1, 3, "桂园");
  addRange("贵中医", "宿舍区", 1, 3, "杏园");
  addRange("贵中医", "宿舍区", 1, 2, "李园");
  add("贵中医", "宿舍区", "竹园");
  ["A", "B", "C", "D"].forEach((area) => add("贵中医", "宿舍区", `桃园${area}区`));
  add("贵中医", "宿舍区", "H8号学生公寓");
  add("贵中医", "宿舍区", "J5学生公寓");

  addRange("理工", "学生公寓一期", 1, 5, "学生公寓一期");
  ["H01-2", "H02-1", "H02-2", "H02-3", "H02-4"].forEach((building) => {
    add("理工", "学生公寓三期", `学生公寓三期${building}`);
  });

  addRange("贵科院", "学生公寓", 1, 13, "学生公寓");
  add("贵科院", "学生公寓", "学生公寓14栋（留学生公寓）");
  addRange("人文", "学生宿舍", 1, 8, "学生宿舍");
  add("人文", "学生宿舍", "学生宿舍9栋");

  return entries;
}

function isGenericBuilding(building) {
  return /^[A-Z]?\d{1,3}栋$/.test(compactText(building)) || /^9[AB]栋$/.test(compactText(building));
}

function scoreDormMatch(entry, sourceText) {
  const text = compactText(sourceText);
  const school = compactText(entry.school);
  const campus = compactText(entry.campus);
  const building = compactText(entry.building);
  const shortBuilding = building.replace("学生公寓", "").replace("学生宿舍", "");
  const aliases = buildingAliases(entry).map(compactText);
  const hasSchool = school && text.includes(school);
  const hasCampus = campus && text.includes(campus);
  const candidates = [
    { value: `${school}${campus}${building}`, score: 1000 },
    { value: `${school}${building}`, score: 850 },
    { value: `${campus}${building}`, score: 760 },
    { value: `${school}${shortBuilding}`, score: 740 },
    { value: `${campus}${shortBuilding}`, score: 700 }
  ];

  for (const candidate of candidates) {
    if (candidate.value && candidate.value !== school && candidate.value !== campus && text.includes(candidate.value)) {
      return candidate.score + candidate.value.length;
    }
  }

  if (building && text.includes(building)) {
    if (!isGenericBuilding(entry.building)) return 650 + building.length;
    if (hasSchool && hasCampus) return 520 + building.length;
    if (hasSchool || hasCampus) return 420 + building.length;
  }
  if (shortBuilding && shortBuilding !== building && text.includes(shortBuilding) && (hasSchool || hasCampus)) {
    return 500 + shortBuilding.length;
  }
  for (const alias of aliases) {
    if (alias && text.includes(alias) && (hasSchool || hasCampus || !isGenericBuilding(entry.building))) {
      return 560 + alias.length;
    }
  }

  return 0;
}

function buildingAliases(entry) {
  const aliases = [];
  const building = normalizeText(entry.building);
  const school = normalizeText(entry.school);
  const campus = normalizeText(entry.campus);

  const areaMatch = building.match(/^([\u4e00-\u9fa5]{2,6}苑)(\d+)栋$/);
  if (areaMatch) {
    const area = areaMatch[1];
    const number = areaMatch[2];
    const shortArea = area.replace("苑", "");
    aliases.push(`${area}${number}`);
    aliases.push(`${shortArea}${number}`);
    aliases.push(`${campus}${area}${number}`);
    aliases.push(`${campus}${shortArea}${number}`);
    aliases.push(`${school}${campus}${shortArea}${number}`);
  }

  const namedGardenMatch = building.match(/^([\u4e00-\u9fa5]{1,6}园)(\d+)栋$/);
  if (namedGardenMatch) {
    const area = namedGardenMatch[1];
    const number = namedGardenMatch[2];
    aliases.push(`${area}${number}`);
    aliases.push(`${campus}${area}${number}`);
    aliases.push(`${school}${area}${number}`);
  }

  if (building === "竹园") aliases.push("竹园");
  if (/^桃园[A-D]区$/.test(building)) aliases.push(building.replace("区", ""));
  if (building.includes("H8")) aliases.push("H8", "H8学生公寓", "桂园H8", "桂园4即H8");
  if (building.includes("J5")) aliases.push("J5", "J5学生公寓");
  if (building.includes("留学生公寓")) aliases.push("14栋留学生公寓", "14栋", "留学生公寓");
  if (school === "人文") aliases.push(building.replace("学生宿舍", ""), `人文院${building.replace("学生宿舍", "")}`);

  return aliases;
}

function findDormInfoInText(sourceText) {
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of DORM_CATALOG) {
    const score = scoreDormMatch(entry, sourceText);
    if (score > bestScore) {
      bestMatch = entry;
      bestScore = score;
    }
  }

  return bestMatch ? { ...bestMatch } : { school: "", campus: "", building: "" };
}

function extractDormInfo(formInfo, address) {
  const formMatch = findDormInfoInText(normalizeText(formInfo));
  if (formMatch.school || formMatch.campus || formMatch.building) return formMatch;

  const addressMatch = findDormInfoInText(normalizeText(address));
  if (addressMatch.school || addressMatch.campus || addressMatch.building) return addressMatch;

  return findDormInfoInText(`${normalizeText(formInfo)} ${normalizeText(address)}`);
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getActiveBatch() {
  return state.batches.find((batch) => batch.id === state.activeBatchId) || null;
}

function excelSerialToDate(value) {
  const baseDate = new Date(Date.UTC(1899, 11, 30));
  return new Date(baseDate.getTime() + Number(value) * 24 * 60 * 60 * 1000);
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToDate(value);
  const text = normalizeText(value).replace(/-/g, "/");
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculatePickupDate(paymentTime) {
  const parsed = parseDate(paymentTime);
  if (!parsed) return { pickupDate: "", note: "付款时间无效" };
  const pickupDate = new Date(parsed);
  if (parsed.getHours() >= 18) pickupDate.setDate(pickupDate.getDate() + 1);
  return { pickupDate: formatDate(pickupDate), note: "" };
}

function extractCampus(formInfo, address, dormInfo = extractDormInfo(formInfo, address)) {
  if (dormInfo.campus) return dormInfo.campus;

  for (const text of [normalizeText(formInfo), normalizeText(address)]) {
    const campus = CAMPUSES.find((item) => text.includes(item));
    if (campus) return campus;

    const knownSchoolMatch = text.match(
      new RegExp(`(${SCHOOL_NAMES.join("|")})\\s*([\\u4e00-\\u9fa5]{0,6}(?:${CAMPUS_SUFFIXES.join("|")}))`)
    );
    if (knownSchoolMatch) return `${knownSchoolMatch[1]}${knownSchoolMatch[2]}`;

    const formalSchoolMatch = text.match(/([^省市区县路号\s]{2,16}(?:大学|学院|学校))\s*([\u4e00-\u9fa5]{0,6}(?:东区|西区|南区|北区|新区|老区|主校区|校区))/);
    if (formalSchoolMatch) return `${formalSchoolMatch[1]}${formalSchoolMatch[2]}`;

    const match = text.match(/(师大|财大)\s*(东区|西区|南区|北区|龙文苑)/);
    if (match) return `${match[1]}${match[2]}`;
  }
  return "";
}

function extractSchool(campus, formInfo, address, dormInfo = extractDormInfo(formInfo, address)) {
  if (dormInfo.school) return dormInfo.school;

  const text = `${normalizeText(campus)} ${normalizeText(formInfo)} ${normalizeText(address)}`;
  const knownSchool = SCHOOL_NAMES.find((school) => text.includes(school));
  if (knownSchool) return knownSchool;
  const formalSchoolMatch = text.match(/([^省市区县路号\s]{2,16}(?:大学|学院|学校))/);
  if (formalSchoolMatch) return formalSchoolMatch[1];
  if (text.includes("财大")) return "财大";
  if (text.includes("师大")) return "师大";
  return "";
}

function extractBuilding(formInfo, address, dormInfo = extractDormInfo(formInfo, address)) {
  if (dormInfo.building) return dormInfo.building;

  for (const text of [normalizeText(formInfo), normalizeText(address)]) {
    const campusBuildingMatch = text.match(/(?:[\u4e00-\u9fa5]{1,20}(?:东区|西区|南区|北区|新区|老区|主校区|校区|龙文苑))\s*[:：\-—\s,，]*([A-Za-z]?\s*\d{1,3}\s*栋)/);
    if (campusBuildingMatch) return campusBuildingMatch[1].replace(/\s+/g, "").toUpperCase();

    const match = text.match(/([A-Za-z]?\s*\d{1,3}\s*栋)/);
    if (match) return match[1].replace(/\s+/g, "").toUpperCase();
  }
  return "";
}

function extractImageLinks(formInfo) {
  const matches = normalizeText(formInfo).match(/https?:\/\/[^\s,，;；\]\[）)<>"']+/g) || [];
  return [...new Set(matches.map((link) => link.replace(/[。.,，;；:：]+$/g, "")))].join("\n");
}

function buildingNumber(building) {
  const match = normalizeText(building).match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function validateRows(rows) {
  const first = rows[0] || {};
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in first));
  if (missing.length) throw new Error(`订单表缺少以下字段：${missing.join("、")}`);
}

function isWashMerchant(row) {
  const merchant = normalizeText(row["所属商家"]);
  return WASH_MERCHANT_KEYWORDS.some((keyword) => merchant.includes(keyword));
}

function orderState(orderNo) {
  return state.orderStates[orderNo] || {};
}

function buildPickupList(batch) {
  if (!batch) return [];
  validateRows(batch.rows);

  const rows = batch.rows.filter((row) => {
    const refundAmount = Number(normalizeText(row["退款金额"]) || 0);
    return (
      isWashMerchant(row) &&
      normalizeText(row["状态"]) === "已支付" &&
      (!Number.isFinite(refundAmount) || refundAmount <= 0)
    );
  });

  const list = rows.map((row) => {
    const dormInfo = extractDormInfo(row["表单信息"], row["收货地址"]);
    const campus = extractCampus(row["表单信息"], row["收货地址"], dormInfo);
    const school = extractSchool(campus, row["表单信息"], row["收货地址"], dormInfo);
    const building = extractBuilding(row["表单信息"], row["收货地址"], dormInfo);
    const pickupDateResult = calculatePickupDate(row["付款时间"]);
    const orderNo = normalizeText(row["订单号"]);
    const saved = orderState(orderNo);
    const notes = [];

    if (!school) notes.push("未识别学校");
    if (!campus) notes.push("未识别校区");
    if (!building) notes.push("未识别楼栋");
    if (pickupDateResult.note) notes.push(pickupDateResult.note);
    if (saved.status === "异常" && !saved.note) notes.push("配送员标记异常");
    if (saved.note) notes.push(saved.note);

    return {
      取件日期: pickupDateResult.pickupDate,
      学校: school,
      校区: campus,
      楼栋: building,
      姓名: normalizeText(row["姓名"]),
      电话: normalizePhone(row["电话"]),
      商品名称: normalizeText(row["商品名称"]),
      规格: normalizeText(row["规格"]),
      数量: normalizeText(row["数量"]),
      地址: normalizeText(row["收货地址"]),
      订单号: orderNo,
      图片链接: extractImageLinks(row["表单信息"]),
      取件状态: saved.status || "待取件",
      异常备注: notes.join("；")
    };
  });

  list.sort((a, b) => {
    const checks = [
      normalizeText(a.学校).localeCompare(normalizeText(b.学校), "zh-CN"),
      normalizeText(a.校区).localeCompare(normalizeText(b.校区), "zh-CN"),
      buildingNumber(a.楼栋) - buildingNumber(b.楼栋),
      normalizeText(a.楼栋).localeCompare(normalizeText(b.楼栋), "zh-CN"),
      normalizeText(a.取件日期).localeCompare(normalizeText(b.取件日期))
    ];
    return checks.find((value) => value !== 0) || 0;
  });

  return list.map((row, index) => ({ 取件顺序: index + 1, ...row }));
}

function buildReturnList(pickupList) {
  return pickupList.map((row, index) => ({
    送回顺序: index + 1,
    送回日期: row.取件日期,
    学校: row.学校,
    校区: row.校区,
    楼栋: row.楼栋,
    姓名: row.姓名,
    电话: row.电话,
    商品名称: row.商品名称,
    规格: row.规格,
    数量: row.数量,
    地址: row.地址,
    订单号: row.订单号,
    图片链接: row.图片链接,
    送回状态: "待送回",
    异常备注: row.异常备注
  }));
}

function buildExceptionList(pickupList) {
  return pickupList.filter((row) => row.异常备注 || row.取件状态 === "未找到" || row.取件状态 === "异常");
}

function buildStats(pickupList) {
  const map = new Map();
  for (const row of pickupList) {
    const key = [row.学校, row.校区, row.楼栋, row.取件日期].join("||");
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => {
    const [school, campus, building, date] = key.split("||");
    return { 取件日期: date, 学校: school, 校区: campus, 楼栋: building, 取件数量: count };
  });
}

function matchesSearch(row) {
  const query = normalizeText(searchInput.value).toLowerCase();
  if (!query) return true;
  return [row.订单号, row.姓名, row.电话, row.学校, row.校区, row.楼栋, row.地址, row.商品名称, row.规格, row.取件状态, row.异常备注]
    .map((value) => normalizeText(value).toLowerCase())
    .some((value) => value.includes(query));
}

function groupRows(pickupList) {
  const groups = [];
  const map = new Map();
  for (const row of pickupList) {
    const key = [row.学校, row.校区, row.楼栋].join("||");
    if (!map.has(key)) {
      const group = {
        key,
        school: row.学校 || "学校未识别",
        campus: row.校区 || "校区未识别",
        building: row.楼栋 || "楼栋未识别",
        rows: []
      };
      map.set(key, group);
      groups.push(group);
    }
    map.get(key).rows.push(row);
  }
  return groups;
}

function groupPickupTree(pickupList) {
  const schools = [];
  const schoolMap = new Map();

  for (const group of groupRows(pickupList)) {
    if (!schoolMap.has(group.school)) {
      const schoolGroup = { key: group.school, title: group.school, campuses: [], rows: [] };
      schoolMap.set(group.school, schoolGroup);
      schools.push(schoolGroup);
    }
    const schoolGroup = schoolMap.get(group.school);
    schoolGroup.rows.push(...group.rows);

    const campusKey = `${group.school}||${group.campus}`;
    let campusGroup = schoolGroup.campuses.find((item) => item.key === campusKey);
    if (!campusGroup) {
      campusGroup = { key: campusKey, title: group.campus, buildings: [], rows: [] };
      schoolGroup.campuses.push(campusGroup);
    }
    campusGroup.rows.push(...group.rows);
    campusGroup.buildings.push(group);
  }

  return schools;
}

function progressText(rows) {
  const done = rows.filter((row) => row.取件状态 === "已取到").length;
  return `已取 ${done}/${rows.length}`;
}

function hasUnfinished(rows) {
  return rows.some((row) => row.取件状态 !== "已取到");
}

function updateOrder(orderNo, patch) {
  state.orderStates[orderNo] = { ...orderState(orderNo), ...patch };
  saveState();
  render();
}

function pickupSmsBody(row) {
  return `【${BRAND_NAME}】${row.姓名}您好，您的洗鞋订单${row.订单号}已安排取件。取件员将到${row.校区}${row.楼栋}联系您，请保持电话畅通。`;
}

function imageLinks(row) {
  return normalizeText(row.图片链接)
    .split("\n")
    .map((link) => normalizeText(link))
    .filter(Boolean);
}

function openImageModal(src) {
  $("#imageModalImg").src = src;
  $("#imageModal").classList.remove("hidden");
}

function closeImageModal() {
  $("#imageModal").classList.add("hidden");
  $("#imageModalImg").src = "";
}

function renderOrderCard(row) {
  const template = $("#orderCardTemplate").content.cloneNode(true);
  const card = template.querySelector(".order-card");
  const badge = template.querySelector(".status-badge");
  const warning = template.querySelector(".order-warning");
  const noteInput = template.querySelector(".note-input");

  template.querySelector(".order-title").textContent = `${row.姓名 || "未填姓名"} · ${row.电话 || "未填电话"}`;
  template.querySelector(".order-subtitle").textContent = `${row.校区 || "校区未识别"} ${row.楼栋 || "楼栋未识别"}`;
  template.querySelector(".order-address").textContent = row.地址;
  template.querySelector(".order-product").textContent = `${row.商品名称} / ${row.规格} / 数量 ${row.数量}`;
  template.querySelector(".order-no").textContent = `订单号：${row.订单号}`;
  badge.textContent = row.取件状态;
  if (row.取件状态 === "已取到") badge.classList.add("done");
  if (row.取件状态 === "未找到" || row.取件状态 === "异常") badge.classList.add("bad");

  if (row.异常备注) {
    warning.textContent = `异常：${row.异常备注}`;
    warning.classList.add("show");
  }

  const images = imageLinks(row);
  const firstImage = images[0];
  template.querySelector(".quick-actions").innerHTML = `
    <a href="sms:${encodeURIComponent(row.电话)}?body=${encodeURIComponent(pickupSmsBody(row))}">发短信</a>
    <a href="tel:${escapeHtml(row.电话)}">打电话</a>
    <button class="image-action" type="button" ${firstImage ? "" : "disabled"}>
      ${firstImage ? "看图片" : "无图片"}
      ${firstImage ? `<span class="image-hover-preview"><img src="${escapeHtml(firstImage)}" alt="订单图片预览"></span>` : ""}
    </button>
  `;

  const imageButton = template.querySelector(".image-action");
  const previewPanel = template.querySelector(".image-preview-panel");
  if (firstImage) {
    imageButton.addEventListener("click", () => {
      previewPanel.classList.toggle("hidden");
    });
    images.forEach((src, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "image-thumb";
      thumb.innerHTML = `<img src="${escapeHtml(src)}" alt="订单图片${index + 1}"><span>点击放大</span>`;
      thumb.addEventListener("click", () => openImageModal(src));
      thumb.addEventListener("dblclick", () => openImageModal(src));
      previewPanel.appendChild(thumb);
    });
  }

  const statusActions = template.querySelector(".status-actions");
  for (const status of STATUS_LIST) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = status;
    if (row.取件状态 === status) button.classList.add("active");
    button.addEventListener("click", () => updateOrder(row.订单号, { status }));
    statusActions.appendChild(button);
  }

  const noteActions = template.querySelector(".note-actions");
  for (const note of NOTE_SHORTCUTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = note;
    button.addEventListener("click", () => updateOrder(row.订单号, { note, status: "异常" }));
    noteActions.appendChild(button);
  }

  noteInput.value = orderState(row.订单号).note || "";
  noteInput.addEventListener("change", () => updateOrder(row.订单号, { note: noteInput.value }));
  card.dataset.orderNo = row.订单号;
  return template;
}

$("#imageModalClose").addEventListener("click", closeImageModal);
$("#imageModal").addEventListener("click", (event) => {
  if (event.target.id === "imageModal") closeImageModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImageModal();
});

function renderBatchSelect() {
  batchSelect.innerHTML = "";
  if (!state.batches.length) {
    const option = document.createElement("option");
    option.textContent = "暂无批次";
    option.value = "";
    batchSelect.appendChild(option);
    return;
  }
  for (const batch of state.batches) {
    const option = document.createElement("option");
    option.value = batch.id;
    option.textContent = batch.name;
    option.selected = batch.id === state.activeBatchId;
    batchSelect.appendChild(option);
  }
}

function renderStatsNumbers(pickupList, exceptionList) {
  $("#statTotal").textContent = pickupList.length;
  $("#statDone").textContent = pickupList.filter((row) => row.取件状态 === "已取到").length;
  $("#statTodo").textContent = pickupList.filter((row) => row.取件状态 === "待取件").length;
  $("#statException").textContent = exceptionList.length;
}

function renderPickupView(rows) {
  const root = $("#pickupView");
  root.innerHTML = "";
  const schools = groupPickupTree(rows);

  for (const school of schools) {
    const schoolDetail = document.createElement("details");
    schoolDetail.className = "group school-group";
    schoolDetail.open = hasUnfinished(school.rows);
    if (!hasUnfinished(school.rows)) schoolDetail.classList.add("done");
    schoolDetail.innerHTML = `<summary>${escapeHtml(school.title)} · ${progressText(school.rows)}</summary><div class="group-body school-body"></div>`;
    const schoolBody = schoolDetail.querySelector(".school-body");

    for (const campus of school.campuses) {
      const campusDetail = document.createElement("details");
      campusDetail.className = "group campus-group";
      campusDetail.open = hasUnfinished(campus.rows);
      if (!hasUnfinished(campus.rows)) campusDetail.classList.add("done");
      campusDetail.innerHTML = `<summary>${escapeHtml(campus.title)} · ${progressText(campus.rows)}</summary><div class="group-body campus-body"></div>`;
      const campusBody = campusDetail.querySelector(".campus-body");

      for (const building of campus.buildings) {
        const buildingDetail = document.createElement("details");
        buildingDetail.className = "group building-group";
        buildingDetail.open = hasUnfinished(building.rows);
        if (!hasUnfinished(building.rows)) buildingDetail.classList.add("done");
        const dates = [...new Set(building.rows.map((row) => normalizeText(row.取件日期)).filter(Boolean))].join("、") || "日期未识别";
        buildingDetail.innerHTML = `<summary>${escapeHtml(building.building)}｜${escapeHtml(dates)} · ${progressText(building.rows)}</summary><div class="group-body building-body"></div>`;
        const buildingBody = buildingDetail.querySelector(".building-body");
        building.rows.forEach((row) => buildingBody.appendChild(renderOrderCard(row)));
        campusBody.appendChild(buildingDetail);
      }

      schoolBody.appendChild(campusDetail);
    }

    root.appendChild(schoolDetail);
  }
}

function renderExceptionsView(exceptionRows) {
  const root = $("#exceptionsView");
  root.innerHTML = "";
  if (!exceptionRows.length) {
    root.innerHTML = '<section class="empty-state"><h2>暂无异常订单</h2><p>标记“未找到”或“异常”的订单会出现在这里。</p></section>';
    return;
  }
  exceptionRows.forEach((row) => root.appendChild(renderOrderCard(row)));
}

function renderTable(root, rows, columns) {
  if (!rows.length) {
    root.innerHTML = '<section class="empty-state"><h2>暂无数据</h2><p>当前筛选条件下没有记录。</p></section>';
    return;
  }
  const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`)
    .join("");
  root.innerHTML = `<div class="table-panel"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function render() {
  renderBatchSelect();
  const batch = getActiveBatch();
  const hasBatch = Boolean(batch);
  $("#emptyState").classList.toggle("hidden", hasBatch);
  $("#pickupView").classList.toggle("hidden", !hasBatch || activeTab !== "pickup");
  $("#exceptionsView").classList.toggle("hidden", !hasBatch || activeTab !== "exceptions");
  $("#returnView").classList.toggle("hidden", !hasBatch || activeTab !== "return");
  $("#statsView").classList.toggle("hidden", !hasBatch || activeTab !== "stats");

  if (!batch) {
    renderStatsNumbers([], []);
    return;
  }

  let pickupList;
  try {
    pickupList = buildPickupList(batch);
  } catch (error) {
    alert(error.message);
    return;
  }
  const filteredPickup = pickupList.filter(matchesSearch);
  const exceptionList = buildExceptionList(pickupList).filter(matchesSearch);
  const returnList = buildReturnList(pickupList).filter(matchesSearch);
  const stats = buildStats(pickupList).filter(matchesSearch);

  renderStatsNumbers(pickupList, buildExceptionList(pickupList));
  if (activeTab === "pickup") renderPickupView(filteredPickup);
  if (activeTab === "exceptions") renderExceptionsView(exceptionList);
  if (activeTab === "return") renderTable($("#returnView"), returnList, ["送回顺序", "送回日期", "学校", "校区", "楼栋", "姓名", "电话", "商品名称", "规格", "数量", "地址", "订单号", "送回状态", "异常备注"]);
  if (activeTab === "stats") renderTable($("#statsView"), stats, ["取件日期", "学校", "校区", "楼栋", "取件数量"]);
}

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function importFiles(files) {
  const groups = [];
  for (const file of files) groups.push(await readWorkbook(file));
  const rows = [];
  const seen = new Set();
  for (const row of groups.flat()) {
    const orderNo = normalizeText(row["订单号"]);
    if (orderNo && seen.has(orderNo)) continue;
    if (orderNo) seen.add(orderNo);
    rows.push(row);
  }
  validateRows(rows);
  const id = `batch_${Date.now()}`;
  const name = `${formatDate(new Date())} 订单批次`;
  state.batches.unshift({ id, name, createdAt: new Date().toISOString(), rows });
  state.activeBatchId = id;
  saveState();
  render();
}

function exportExcel(sheets, fileName) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31));
  }
  XLSX.writeFile(workbook, fileName);
}

function activeLists() {
  const pickupList = buildPickupList(getActiveBatch());
  return {
    pickupList,
    returnList: buildReturnList(pickupList),
    exceptionList: buildExceptionList(pickupList),
    stats: buildStats(pickupList)
  };
}

fileInput.addEventListener("change", async (event) => {
  try {
    await importFiles([...event.target.files]);
    event.target.value = "";
  } catch (error) {
    alert(error.message || "导入失败，请确认 Excel 字段完整。");
  }
});

restoreInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state = JSON.parse(await file.text());
    saveState();
    render();
  } catch {
    alert("备份文件无法读取。");
  }
});

batchSelect.addEventListener("change", () => {
  state.activeBatchId = batchSelect.value;
  saveState();
  render();
});

searchInput.addEventListener("input", render);

$("#renameBatchBtn").addEventListener("click", () => {
  const batch = getActiveBatch();
  if (!batch) return;
  const name = prompt("请输入批次名称", batch.name);
  if (!name) return;
  batch.name = name;
  saveState();
  render();
});

$("#deleteBatchBtn").addEventListener("click", () => {
  const batch = getActiveBatch();
  if (!batch || !confirm(`确定删除“${batch.name}”吗？`)) return;
  state.batches = state.batches.filter((item) => item.id !== batch.id);
  state.activeBatchId = state.batches[0]?.id || "";
  saveState();
  render();
});

$("#exportAllBtn").addEventListener("click", () => {
  const batch = getActiveBatch();
  if (!batch) return alert("请先导入订单。");
  const lists = activeLists();
  exportExcel({ 取件清单: lists.pickupList, 送回清单: lists.returnList, 异常订单: lists.exceptionList, 数量统计: lists.stats }, "事事洗护配送清单.xlsx");
});

$("#exportExceptionBtn").addEventListener("click", () => {
  const batch = getActiveBatch();
  if (!batch) return alert("请先导入订单。");
  exportExcel({ 异常订单: activeLists().exceptionList }, "事事洗护异常订单.xlsx");
});

$("#backupBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "事事洗护配送数据备份.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
