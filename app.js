
'use strict';
// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const MONTHS=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const YEARS=['2025','2026','2027'];
const ALL_MONTHS=[...MONTHS.map(m=>m+' 2025'),...MONTHS.map(m=>m+' 2026'),...MONTHS.map(m=>m+' 2027')];
const SEKIL=['Banka','Elden','IBAN','Global','Nakit','Diğer'];
const GKAT=['Elektrik','Doğalgaz','Su (İSKİ)','İnternet','Merdiven Temizlik','Asansör Servis','DASK','Depozito İade','Tamirat','Diğer'];

// false = demo data (v5 behaviour); true = empty production start
const PRODUCTION_MODE = false;

const BK=['GAYRETTEPE','KARAKOL','TAN SOKAK'];
const BL={GAYRETTEPE:'Gayrettepe',KARAKOL:'Karakol','TAN SOKAK':'Tan Sokak'};
const BS={GAYRETTEPE:'G',KARAKOL:'K','TAN SOKAK':'T'};

// ═══════════════════════════════════════════════
// USERS (multi-user with PIN)
// ═══════════════════════════════════════════════
const DEFAULT_USERS=[
  {id:'malik', name:'Malik (Sahip)',  role:'admin',   pin:'1234', color:'#4a8af4', avatar:'M'},
  {id:'alper', name:'Alper',          role:'manager', pin:'5678', color:'#7b6cf6', avatar:'A'},
  {id:'hamid', name:'Hamid Bey',      role:'viewer',  pin:'9999', color:'#06d6a0', avatar:'H'},
];
let USERS=[];
let currentUser=null;
let loginSelectedUser=null;

// ═══════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════

const BASE_PAYMENTS={"G1": {"Nisan 2026": {"paid": 30000, "date": "2026-05-04", "sekil": "", "notes": "elden"}}, "G2": {"Nisan 2026": {"paid": 30000, "date": "2026-04-05", "sekil": "", "notes": ""}}, "G3": {"Nisan 2026": {"paid": 25000, "date": "2026-01-10", "sekil": "", "notes": ""}}, "G4": {"Nisan 2026": {"paid": 27000, "date": "2026-04-16", "sekil": "", "notes": "bank"}}, "G5": {"Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": ""}}, "G7": {"Nisan 2026": {"paid": 32000, "date": "", "sekil": "", "notes": "29 Haziran tarihine kadar ödeme yapmış."}}, "G8": {"Nisan 2026": {"paid": 24000, "date": "2026-04-13", "sekil": "", "notes": ""}}, "G9": {"Nisan 2026": {"paid": 28000, "date": "2026-04-15", "sekil": "", "notes": ""}}, "G10": {"Nisan 2026": {"paid": 30000, "date": "2026-04-01", "sekil": "", "notes": ""}}, "G11": {"Nisan 2026": {"paid": 32000, "date": "2026-04-05", "sekil": "", "notes": ""}}, "G12": {"Nisan 2026": {"paid": 28000, "date": "2026-04-05", "sekil": "", "notes": ""}}, "G13": {"Nisan 2026": {"paid": 27500, "date": "2026-04-02", "sekil": "", "notes": ""}}, "G14": {"Nisan 2026": {"paid": 38000, "date": "2026-04-21", "sekil": "", "notes": "keraye jadid"}}, "G15": {"Nisan 2026": {"paid": 32000, "date": "2026-04-28", "sekil": "", "notes": "elden"}}, "G16": {"Nisan 2026": {"paid": 27000, "date": "2026-04-20", "sekil": "", "notes": ""}}, "G17": {"Nisan 2026": {"paid": 27000, "date": "2026-04-25", "sekil": "", "notes": ""}}, "G19": {"Nisan 2026": {"paid": 35000, "date": "2026-05-01", "sekil": "", "notes": "elden"}}, "G20": {"Nisan 2026": {"paid": 24000, "date": "2026-04-02", "sekil": "", "notes": "also paid cash on 04/05/2026"}}, "K9": {"Ocak 2025": {"paid": 24000, "date": "2025-01-10", "sekil": "Elden", "notes": ""}, "Şubat 2025": {"paid": 24000, "date": "", "sekil": "Banka", "notes": ""}, "Mart 2025": {"paid": 24000, "date": "2025-03-14", "sekil": "Banka", "notes": ""}, "Nisan 2025": {"paid": 24000, "date": "2025-04-15", "sekil": "Banka", "notes": ""}, "Mayıs 2025": {"paid": 24000, "date": "2025-05-12", "sekil": "Banka", "notes": ""}, "Haziran 2025": {"paid": 24000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Temmuz 2025": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Ağustos 2025": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Eylül 2025": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Ekim 2025": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Kasım 2025": {"paid": 30000, "date": "2025-05-12", "sekil": "Banka", "notes": ""}, "Aralık 2025": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Ocak 2026": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Şubat 2026": {"paid": 30000, "date": "2025-06-12", "sekil": "Banka", "notes": ""}, "Mart 2026": {"paid": 30000, "date": "2026-03-14", "sekil": "Global", "notes": ""}, "Nisan 2026": {"paid": 30000, "date": "2026-04-12", "sekil": "Global", "notes": ""}}, "K7": {"Ocak 2025": {"paid": 12000, "date": "2025-01-21", "sekil": "", "notes": ""}, "Şubat 2025": {"paid": 12000, "date": "2025-02-17", "sekil": "", "notes": ""}, "Mart 2025": {"paid": 12000, "date": "2025-03-24", "sekil": "", "notes": ""}, "Nisan 2025": {"paid": 12000, "date": "", "sekil": "", "notes": ""}, "Mayıs 2025": {"paid": 12000, "date": "2025-05-21", "sekil": "Global", "notes": ""}, "Haziran 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Temmuz 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Ağustos 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Eylül 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Ekim 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Kasım 2025": {"paid": 12000, "date": "2025-05-21", "sekil": "Global", "notes": ""}, "Aralık 2025": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Ocak 2026": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Şubat 2026": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Mart 2026": {"paid": 12000, "date": "2025-06-17", "sekil": "Global", "notes": ""}, "Nisan 2026": {"paid": 12000, "date": "2026-04-15", "sekil": "", "notes": ""}}, "K3": {"Ocak 2025": {"paid": 17000, "date": "2025-01-19", "sekil": "", "notes": ""}, "Şubat 2025": {"paid": 25000, "date": "2025-02-17", "sekil": "", "notes": ""}, "Mart 2025": {"paid": 25000, "date": "2025-03-20", "sekil": "", "notes": ""}, "Nisan 2025": {"paid": 25000, "date": "", "sekil": "", "notes": ""}, "Mayıs 2025": {"paid": 25000, "date": "2025-05-19", "sekil": "Elden", "notes": ""}, "Haziran 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Elden", "notes": ""}, "Temmuz 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Elden", "notes": ""}, "Ağustos 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Banka", "notes": ""}, "Eylül 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Banka", "notes": ""}, "Ekim 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Banka", "notes": ""}, "Kasım 2025": {"paid": 25000, "date": "2025-05-19", "sekil": "Banka", "notes": ""}, "Aralık 2025": {"paid": 25000, "date": "2025-06-18", "sekil": "Banka", "notes": ""}, "Ocak 2026": {"paid": 30000, "date": "2026-01-15", "sekil": "Banka", "notes": ""}, "Şubat 2026": {"paid": 30000, "date": "2026-02-16", "sekil": "Banka", "notes": ""}, "Mart 2026": {"paid": 30000, "date": "2026-03-15", "sekil": "Banka", "notes": ""}, "Nisan 2026": {"paid": 30000, "date": "2026-04-15", "sekil": "Banka", "notes": ""}}, "K8": {"Ocak 2025": {"paid": 20000, "date": "2025-01-23", "sekil": "", "notes": ""}, "Şubat 2025": {"paid": 20000, "date": "2025-03-03", "sekil": "", "notes": ""}, "Mart 2025": {"paid": 20000, "date": "2025-03-25", "sekil": "", "notes": ""}, "Nisan 2025": {"paid": 20000, "date": "", "sekil": "", "notes": ""}, "Mayıs 2025": {"paid": 20000, "date": "2025-05-02", "sekil": "Elden", "notes": ""}, "Haziran 2025": {"paid": 20000, "date": "2025-07-05", "sekil": "Global", "notes": ""}, "Temmuz 2025": {"paid": 20000, "date": "2025-07-05", "sekil": "Global", "notes": ""}, "Ağustos 2025": {"paid": 0, "date": "2025-07-05", "sekil": "", "notes": ""}, "Eylül 2025": {"paid": 25000, "date": "2025-09-15", "sekil": "Global", "notes": ""}, "Ekim 2025": {"paid": 25000, "date": "2025-10-15", "sekil": "Alireza Bey", "notes": ""}, "Kasım 2025": {"paid": 25000, "date": "2026-11-24", "sekil": "Global", "notes": ""}, "Aralık 2025": {"paid": 20000, "date": "2025-07-05", "sekil": "Global", "notes": ""}, "Ocak 2026": {"paid": 20000, "date": "2025-07-05", "sekil": "Global", "notes": ""}, "Şubat 2026": {"paid": 0, "date": "2025-07-05", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 25000, "date": "2025-09-15", "sekil": "Global", "notes": ""}}, "K6": {"Ocak 2025": {"paid": 24000, "date": "2025-01-31", "sekil": "Elden", "notes": ""}, "Şubat 2025": {"paid": 24000, "date": "2025-03-01", "sekil": "Elden", "notes": ""}, "Mart 2025": {"paid": 24000, "date": "2025-04-03", "sekil": "Banka", "notes": ""}, "Nisan 2025": {"paid": 24000, "date": "", "sekil": "Banka", "notes": ""}, "Mayıs 2025": {"paid": 24000, "date": "2025-06-01", "sekil": "Banka", "notes": ""}, "Haziran 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Temmuz 2025": {"paid": 32000, "date": "2025-07-25", "sekil": "Elden", "notes": ""}, "Ağustos 2025": {"paid": 32000, "date": "2025-08-25", "sekil": "Elden", "notes": ""}, "Eylül 2025": {"paid": 32000, "date": "2025-09-26", "sekil": "Elden", "notes": ""}, "Ekim 2025": {"paid": 32000, "date": "2025-10-24", "sekil": "Elden", "notes": ""}, "Kasım 2025": {"paid": 24000, "date": "2025-06-01", "sekil": "Banka", "notes": ""}, "Aralık 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Ocak 2026": {"paid": 32000, "date": "2025-07-25", "sekil": "Elden", "notes": ""}, "Şubat 2026": {"paid": 32000, "date": "2025-08-25", "sekil": "Elden", "notes": ""}, "Mart 2026": {"paid": 32000, "date": "2025-09-26", "sekil": "Elden", "notes": ""}, "Nisan 2026": {"paid": 32000, "date": "2026-04-24", "sekil": "Elden", "notes": ""}}, "K1": {"Ocak 2025": {"paid": 22000, "date": "2025-02-08", "sekil": "", "notes": ""}, "Şubat 2025": {"paid": 22000, "date": "2025-03-05", "sekil": "Banka", "notes": ""}, "Mart 2025": {"paid": 22000, "date": "", "sekil": "Banka", "notes": ""}, "Nisan 2025": {"paid": 22000, "date": "", "sekil": "Banka", "notes": ""}, "Mayıs 2025": {"paid": 22000, "date": "2025-05-09", "sekil": "Banka", "notes": ""}, "Haziran 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Temmuz 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Ağustos 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Eylül 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Ekim 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Kasım 2025": {"paid": 0, "date": "2025-05-09", "sekil": "Banka", "notes": ""}, "Aralık 2025": {"paid": 0, "date": "", "sekil": "Banka", "notes": ""}, "Şubat 2026": {"paid": 28000, "date": "2026-02-09", "sekil": "Elden", "notes": ""}, "Mart 2026": {"paid": 28000, "date": "", "sekil": "Elden", "notes": "?"}, "Nisan 2026": {"paid": 28000, "date": "", "sekil": "Elden", "notes": ""}}, "K4": {"Şubat 2025": {"paid": 24000, "date": "2025-02-03", "sekil": "Banka", "notes": ""}, "Mart 2025": {"paid": 24000, "date": "2025-03-01", "sekil": "Banka", "notes": ""}, "Nisan 2025": {"paid": 24000, "date": "2025-04-01", "sekil": "Banka", "notes": ""}, "Mayıs 2025": {"paid": 24000, "date": "2025-04-01", "sekil": "Banka", "notes": ""}, "Haziran 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Temmuz 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Ağustos 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Eylül 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Ekim 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Kasım 2025": {"paid": 24000, "date": "2025-04-01", "sekil": "Banka", "notes": ""}, "Aralık 2025": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Ocak 2026": {"paid": 24000, "date": "2026-01-02", "sekil": "Banka", "notes": ""}, "Şubat 2026": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Mart 2026": {"paid": 24000, "date": "2025-07-01", "sekil": "Banka", "notes": ""}, "Nisan 2026": {"paid": 24000, "date": "2026-05-02", "sekil": "Banka", "notes": ""}}, "K2": {"Şubat 2025": {"paid": 26000, "date": "", "sekil": "", "notes": ""}, "Mart 2025": {"paid": 26000, "date": "2025-03-24", "sekil": "", "notes": ""}, "Nisan 2025": {"paid": 26000, "date": "2025-04-10", "sekil": "", "notes": ""}, "Mayıs 2025": {"paid": 0, "date": "2025-04-10", "sekil": "", "notes": ""}, "Haziran 2025": {"paid": 26000, "date": "2025-06-23", "sekil": "Elden", "notes": ""}, "Temmuz 2025": {"paid": 26000, "date": "2025-06-23", "sekil": "Elden", "notes": ""}, "Eylül 2025": {"paid": 26000, "date": "2025-09-01", "sekil": "Elden", "notes": ""}, "Ekim 2025": {"paid": 26000, "date": "", "sekil": "Elden", "notes": ""}, "Kasım 2025": {"paid": 25400, "date": "2025-11-02", "sekil": "", "notes": "600 eksik"}, "Aralık 2025": {"paid": 26000, "date": "2025-12-11", "sekil": "Elden", "notes": ""}, "Ocak 2026": {"paid": 15000, "date": "2026-01-18", "sekil": "Elden", "notes": "su probleme"}, "Şubat 2026": {"paid": 26000, "date": "2026-02-03", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 26000, "date": "2026-03-16", "sekil": "Elden", "notes": ""}, "Mayıs 2026": {"paid": 30000, "date": "2026-04-24", "sekil": "Banka", "notes": "Karakol D2 ilk kira ödemesi 01.05.2026 girişli"}}, "K5": {"Şubat 2025": {"paid": 20000, "date": "", "sekil": "", "notes": ""}, "Mart 2025": {"paid": 20000, "date": "2025-03-14", "sekil": "", "notes": ""}, "Nisan 2025": {"paid": 20000, "date": "2025-04-10", "sekil": "", "notes": ""}, "Mayıs 2025": {"paid": 20000, "date": "2025-05-13", "sekil": "", "notes": ""}, "Haziran 2025": {"paid": 20000, "date": "", "sekil": "Elden", "notes": ""}, "Temmuz 2025": {"paid": 20000, "date": "2025-07-05", "sekil": "Elden", "notes": ""}, "Ağustos 2025": {"paid": 30000, "date": "2025-08-15", "sekil": "Elden", "notes": ""}, "Eylül 2025": {"paid": 30000, "date": "2025-09-15", "sekil": "Elden", "notes": ""}, "Ekim 2025": {"paid": 30000, "date": "2025-08-15", "sekil": "Elden", "notes": ""}, "Kasım 2025": {"paid": 30000, "date": "2025-05-13", "sekil": "", "notes": ""}, "Aralık 2025": {"paid": 20000, "date": "", "sekil": "Elden", "notes": ""}, "Ocak 2026": {"paid": 20000, "date": "2025-07-05", "sekil": "Elden", "notes": ""}, "Şubat 2026": {"paid": 30000, "date": "2025-08-15", "sekil": "Elden", "notes": ""}, "Mart 2026": {"paid": 30000, "date": "2025-09-15", "sekil": "Elden", "notes": ""}, "Nisan 2026": {"paid": 30000, "date": "2026-04-17", "sekil": "Banka", "notes": ""}}, "T1": {"Ocak 2026": {"paid": 20000, "date": "2026-01-10", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-03-11", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-04-09", "sekil": "", "notes": "gec odede"}}, "T4": {"Ocak 2026": {"paid": 20000, "date": "2026-01-15", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-25", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-16", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-17", "sekil": "", "notes": "bank"}}, "T5": {"Ocak 2026": {"paid": 20000, "date": "", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-11", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 0, "date": "2026-02-11", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": ""}}, "T6": {"Ocak 2026": {"paid": 19000, "date": "2026-01-23", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 0, "date": "", "sekil": "", "notes": "BOŞ"}, "Nisan 2026": {"paid": 21000, "date": "2026-04-06", "sekil": "", "notes": "3AY KIRA MUDDETI"}}, "T8": {"Ocak 2026": {"paid": 20000, "date": "2026-12-01", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-01", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-05", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-06", "sekil": "", "notes": ""}}, "T10": {"Ocak 2026": {"paid": 19000, "date": "2026-01-15", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 19000, "date": "2026-02-16", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 19000, "date": "2026-03-16", "sekil": "", "notes": ""}}, "T11": {"Ocak 2026": {"paid": 17000, "date": "2026-12-30", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 17000, "date": "2026-02-28", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 17000, "date": "2026-02-28", "sekil": "", "notes": ""}}, "T13": {"Ocak 2026": {"paid": 20000, "date": "2026-12-03", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-09", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 0, "date": "2026-02-09", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": ""}}, "T14": {"Ocak 2026": {"paid": 19000, "date": "2026-01-27", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 19000, "date": "2026-03-02", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 19000, "date": "2026-03-30", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 19000, "date": "2026-04-27", "sekil": "", "notes": ""}}, "T15": {"Ocak 2026": {"paid": 20000, "date": "2026-12-29", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-03-02", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-02", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-05-04", "sekil": "", "notes": "elden"}, "Mayıs 2026": {"paid": 20000, "date": "2026-05-01", "sekil": "Elden", "notes": ""}}, "T17": {"Ocak 2026": {"paid": 0, "date": "2025-06-24", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-15", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-08", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-15", "sekil": "", "notes": ""}}, "T19": {"Ocak 2026": {"paid": 20000, "date": "2026-12-03", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-12", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-07", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": ""}}, "T20": {"Ocak 2026": {"paid": 20000, "date": "2026-11-29", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-02-05", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-02-05", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 18200, "date": "2026-04-06", "sekil": "", "notes": "Faturalardan dolayı 1800 TL eksik ödeme yapılmıştır."}, "Mayıs 2026": {"paid": 20000, "date": "2026-05-08", "sekil": "Elden", "notes": ""}}, "T21": {"Ocak 2026": {"paid": 20000, "date": "2026-12-25", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 20000, "date": "2026-03-07", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-04-14", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-26", "sekil": "", "notes": ""}}, "T22": {"Ocak 2026": {"paid": 17000, "date": "2026-01-17", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 17000, "date": "2026-03-09", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 0, "date": "2026-03-17", "sekil": "", "notes": "BOŞ"}, "Nisan 2026": {"paid": 19000, "date": "2026-04-02", "sekil": "", "notes": "yeni kiraci"}}, "T23": {"Ocak 2026": {"paid": 19000, "date": "2026-01-20", "sekil": "", "notes": ""}, "Şubat 2026": {"paid": 19000, "date": "2026-02-20", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 19000, "date": "2026-03-20", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 19000, "date": "2026-04-20", "sekil": "", "notes": "bank"}}, "T2": {"Şubat 2026": {"paid": 20000, "date": "2026-02-01", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-09", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": ""}}, "T7": {"Şubat 2026": {"paid": 20000, "date": "2026-02-20", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-20", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-05-04", "sekil": "", "notes": ""}, "Mayıs 2026": {"paid": 20000, "date": "2026-05-01", "sekil": "Elden", "notes": ""}}, "T9": {"Şubat 2026": {"paid": 20000, "date": "2026-02-16", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-16", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-17", "sekil": "", "notes": ""}}, "T12": {"Şubat 2026": {"paid": 20000, "date": "2026-02-19", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-02-19", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-05-08", "sekil": "", "notes": ""}}, "T16": {"Şubat 2026": {"paid": 20000, "date": "2026-02-01", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-10", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-10", "sekil": "", "notes": "elden"}, "Mayıs 2026": {"paid": 20000, "date": "2026-05-08", "sekil": "", "notes": ""}}, "T18": {"Şubat 2026": {"paid": 20000, "date": "2026-02-16", "sekil": "", "notes": ""}, "Mart 2026": {"paid": 20000, "date": "2026-03-31", "sekil": "", "notes": ""}, "Nisan 2026": {"paid": 20000, "date": "2026-04-16", "sekil": "", "notes": ""}}, "T3": {"Nisan 2026": {"paid": 0, "date": "", "sekil": "", "notes": "bos"}}};
const BASE_EXPENSES={"GAYRETTEPE": {"Nisan 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 15075, "tarih": "2025-11-10", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 30302, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 834, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 34723, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 4000, "tarih": "", "notlar": ""}, {"tur": "ASANSÖR SERVİS", "no": "", "tutar": 3500, "tarih": "", "notlar": ""}]}, "KARAKOL": {"Ocak 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 1003, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 1003, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 1003, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1003, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 0, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 295, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 1500, "tarih": "", "notlar": ""}, {"tur": "DASK 3 ADET", "no": "", "tutar": 2880, "tarih": "", "notlar": ""}], "Şubat 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 140, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 180, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 125, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 205, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 6107, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 1039, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 1177, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 1500, "tarih": "", "notlar": ""}], "Mart 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 503, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 613, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 510, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 963, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 6926, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 751, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 1134, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 1134, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 1134, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 2000, "tarih": "", "notlar": ""}], "Nisan 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 605, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 730, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 540, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 780, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 5395, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 764, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 604, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 604, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 604, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 2000, "tarih": "", "notlar": ""}], "Mayıs 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 580, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 780, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 560, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 710, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 4120, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 765, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 450, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 450, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 450, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Haziran 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 865, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 850, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 770, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 580, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 3917, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 849, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 20001, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 1367, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Temmuz 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 1030, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 905, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 750, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 735, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 2130, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 1026, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 29869, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 1940, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}, {"tur": "D6 temizlik", "no": "", "tutar": 2500, "tarih": "", "notlar": ""}], "Ağustos 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 1100, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 835, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 825, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1730, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 1219, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 849, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 762, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 8198, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}, {"tur": "d5 temizlik", "no": "", "tutar": 2500, "tarih": "", "notlar": ""}, {"tur": "d6 temizlik", "no": "", "tutar": 2500, "tarih": "", "notlar": ""}], "Eylül 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 670, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 905, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 540, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1075, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 872, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 849, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 379, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 4905, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}, {"tur": "d2 temizlik ve spot", "no": "", "tutar": 5800, "tarih": "", "notlar": ""}, {"tur": "d8 temizlik", "no": "", "tutar": 2500, "tarih": "", "notlar": ""}], "Ekim 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 730, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 1090, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 640, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1010, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 659, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 849, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 387, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 5188, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Kasım 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 720, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 1420, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 620, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 995, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 3962, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 850, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 6300, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 481, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Aralık 2025": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 550, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 1050, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 565, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 992, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 6560, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 850, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 9843, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 447, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 11703, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Ocak 2026": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 702, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 1002, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 850, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1200, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 10900, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 875, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438", "tutar": 10252, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 416, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 5662, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3500, "tarih": "", "notlar": ""}], "Şubat 2026": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 619, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 9685, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 875, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 929, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 4000, "tarih": "", "notlar": ""}], "Mart 2026": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 670, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 905, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 540, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 1075, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 872, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 849, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 379, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 4905, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}, {"tur": "d2 temizlik ve spot", "no": "", "tutar": 5800, "tarih": "", "notlar": ""}, {"tur": "d8 temizlik", "no": "", "tutar": 2500, "tarih": "", "notlar": ""}], "Nisan 2026": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 0, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 0, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 0, "tarih": "", "notlar": ""}], "Mayıs 2026": [{"tur": "ELEKTRİK 1", "no": "2538127485", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 2", "no": "4145317749", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK 3", "no": "5618771066", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "ELEKTRİK MERDİVEN", "no": "728693698", "tutar": 0, "tarih": "2025-01-24", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500104612317", "tutar": 0, "tarih": "2025-02-03", "notlar": ""}, {"tur": "İNTERNET", "no": "7046150246", "tutar": 0, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "80678438-48", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D2", "no": "80718487", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "İSKİ D3", "no": "89781968", "tutar": 0, "tarih": "2025-03-04", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 0, "tarih": "", "notlar": ""}]}, "TAN SOKAK": {"Ocak 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 9545, "tarih": "", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 18882, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 686, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 6475, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Şubat 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 9545, "tarih": "", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 18882, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 686, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 6475, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Mart 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 9545, "tarih": "", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 18882, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 686, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 6475, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Nisan 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 9545, "tarih": "", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 18882, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 686, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 6475, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}], "Mayıs 2026": [{"tur": "ELEKTRİK 1", "no": "1785270447", "tutar": 9545, "tarih": "", "notlar": ""}, {"tur": "DOĞALGAZ", "no": "500800423368", "tutar": 18882, "tarih": "", "notlar": ""}, {"tur": "İNTERNET", "no": "7045487915", "tutar": 686, "tarih": "", "notlar": ""}, {"tur": "İSKİ D1", "no": "22292509/1", "tutar": 6475, "tarih": "", "notlar": ""}, {"tur": "MERDİVEN TEMİZLİK", "no": "", "tutar": 3000, "tarih": "", "notlar": ""}]}};
const BASE_TENANTS={"GAYRETTEPE": [{"id": "G1", "unit": "D1", "fl": "1.KAT", "name": "Emir Can İpek", "rent": 30000, "dep": 30000, "bas": "2025-09-20", "bit": "", "gun": 20, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G2", "unit": "D2", "fl": "1.KAT", "name": "Ali̇ Ergi̇ncan", "rent": 30000, "dep": 30000, "bas": "2025-08-10", "bit": "", "gun": 10, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G3", "unit": "D3", "fl": "1.KAT", "name": "Yaşar Bey", "rent": 25000, "dep": 0, "bas": "2025-04-10", "bit": "", "gun": 10, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G4", "unit": "D4", "fl": "1.KAT", "name": "Shirin Farmonkulova", "rent": 27000, "dep": 27000, "bas": "2025-09-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G5", "unit": "D5", "fl": "2.KAT", "name": "Mansur Komi̇ser", "rent": 20000, "dep": 20000, "bas": "2025-03-24", "bit": "", "gun": 24, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G6", "unit": "D6", "fl": "2.KAT", "name": "Keri̇m Gümüş", "rent": 30000, "dep": 30000, "bas": "2025-08-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G7", "unit": "D7", "fl": "2.KAT", "name": "Malek Alsamh", "rent": 32000, "dep": 32000, "bas": "2025-12-29", "bit": "", "gun": 29, "sekil": "", "active": true, "notes": "29 Haziran tarihine kadar ödeme yapmış.", "phone": ""}, {"id": "G8", "unit": "D8", "fl": "2.KAT", "name": "Çağri Güner", "rent": 24000, "dep": 20000, "bas": "2025-05-13", "bit": "", "gun": 13, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G9", "unit": "D9", "fl": "3.KAT", "name": "Görkem Kiraç", "rent": 28000, "dep": 28000, "bas": "2025-03-05", "bit": "", "gun": 5, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G10", "unit": "D10", "fl": "3.KAT", "name": "Eli̇f Doğa Durmuş", "rent": 30000, "dep": 30000, "bas": "2025-05-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G11", "unit": "D11", "fl": "3.KAT", "name": "Gonca Özcan", "rent": 32000, "dep": 32000, "bas": "2025-05-05", "bit": "", "gun": 5, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G12", "unit": "D12", "fl": "3.KAT", "name": "Mustafa Talha Büyük", "rent": 28000, "dep": 28000, "bas": "2025-12-05", "bit": "", "gun": 5, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G13", "unit": "D13", "fl": "4.KAT", "name": "Oğulcan Bayter", "rent": 27500, "dep": 25000, "bas": "2025-03-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G14", "unit": "D14", "fl": "4.KAT", "name": "Mehmet Mumoğlu", "rent": 38000, "dep": 30000, "bas": "2025-04-20", "bit": "", "gun": 20, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G15", "unit": "D15", "fl": "4.KAT", "name": "Vasfi̇ye Ece Karagören", "rent": 32000, "dep": 32000, "bas": "2025-05-19", "bit": "", "gun": 19, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G16", "unit": "D16", "fl": "4.KAT", "name": "Gül Katrancioğlu", "rent": 27000, "dep": 20000, "bas": "2025-03-20", "bit": "", "gun": 20, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G17", "unit": "D17", "fl": "5.KAT", "name": "Sali̇ha Efsa", "rent": 27000, "dep": 27000, "bas": "2025-06-24", "bit": "", "gun": 24, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G18", "unit": "D18", "fl": "5.KAT", "name": "Bahar Berfi̇n Küyük", "rent": 33000, "dep": 30000, "bas": "2025-06-23", "bit": "", "gun": 23, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G19", "unit": "D19", "fl": "5.KAT", "name": "Steven Abd Li̇", "rent": 35000, "dep": 35000, "bas": "2025-06-18", "bit": "", "gun": 18, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G20", "unit": "D20", "fl": "5.KAT", "name": "İsmai̇l Bartu Dolgun", "rent": 24000, "dep": 24000, "bas": "2025-07-01", "bit": "", "gun": 1, "sekil": "Elden", "active": true, "notes": "also paid cash on 04/05/2026", "phone": ""}, {"id": "G21", "unit": "D21", "fl": "GİRİŞ", "name": "Hali̇l Dok", "rent": 27000, "dep": 27000, "bas": "2025-08-08", "bit": "", "gun": 8, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "G22", "unit": "D22", "fl": "ÇATI", "name": "Boş", "rent": 0, "dep": 0, "bas": "", "bit": "", "gun": 1, "sekil": "", "active": false, "notes": "", "phone": ""}, {"id": "G23", "unit": "D23", "fl": "ÇATI", "name": "Boş", "rent": 0, "dep": 0, "bas": "", "bit": "", "gun": 1, "sekil": "", "active": false, "notes": "", "phone": ""}, {"id": "G24", "unit": "D24", "fl": "ÇATI", "name": "Boş", "rent": 0, "dep": 0, "bas": "", "bit": "", "gun": 1, "sekil": "", "active": false, "notes": "", "phone": ""}, {"id": "G25", "unit": "D25", "fl": "OFİS", "name": "Ofi̇s", "rent": 0, "dep": 0, "bas": "", "bit": "", "gun": 1, "sekil": "", "active": false, "notes": "", "phone": ""}], "KARAKOL": [{"id": "K1", "unit": "D1", "fl": "", "name": "Yaşar Kobya", "rent": 28000, "dep": 0, "bas": "2026-01-02", "bit": "", "gun": 2, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K2", "unit": "D2", "fl": "", "name": "Bariş Kocaman", "rent": 30000, "dep": 0, "bas": "2026-05-01", "bit": "", "gun": 1, "sekil": "Banka", "active": true, "notes": "Karakol D2 ilk kira ödemesi 01.05.2026 girişli", "phone": ""}, {"id": "K3", "unit": "D3", "fl": "", "name": "Leyla Akdi̇lek", "rent": 30000, "dep": 0, "bas": "2025-01-16", "bit": "", "gun": 16, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K4", "unit": "D4", "fl": "", "name": "Buse Nur Cengiz", "rent": 24000, "dep": 0, "bas": "2025-02-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K5", "unit": "D5", "fl": "", "name": "Ayten Yilmaz", "rent": 30000, "dep": 0, "bas": "2025-08-12", "bit": "", "gun": 12, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K6", "unit": "D6", "fl": "", "name": "Kadi̇r Oğuz Kaya", "rent": 32000, "dep": 0, "bas": "2025-07-25", "bit": "", "gun": 25, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K7", "unit": "D7", "fl": "", "name": "Özgür Efe Poli̇s", "rent": 12000, "dep": 0, "bas": "2025-01-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K8", "unit": "D8", "fl": "", "name": "İsmai̇l Aydemi̇r", "rent": 25000, "dep": 0, "bas": "2025-09-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "K9", "unit": "D9", "fl": "", "name": "Emre Böckün", "rent": 30000, "dep": 0, "bas": "2025-01-09", "bit": "", "gun": 9, "sekil": "", "active": true, "notes": "", "phone": ""}], "TAN SOKAK": [{"id": "T1", "unit": "D1", "fl": "BODRUM", "name": "Melek Aydin", "rent": 20000, "dep": 20000, "bas": "2000-01-10", "bit": "", "gun": 10, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T2", "unit": "D2", "fl": "BODRUM", "name": "Bahri Uranli", "rent": 20000, "dep": 20000, "bas": "2000-01-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T3", "unit": "D3", "fl": "GİRİŞ", "name": "Depo", "rent": 0, "dep": 0, "bas": "", "bit": "", "gun": 1, "sekil": "", "active": false, "notes": "", "phone": ""}, {"id": "T4", "unit": "D4", "fl": "GİRİŞ", "name": "Muhammad Gocer", "rent": 20000, "dep": 20000, "bas": "2000-01-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T5", "unit": "D5", "fl": "GİRİŞ", "name": "Ziyed Ben Moussa", "rent": 20000, "dep": 20000, "bas": "2000-01-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T6", "unit": "D6", "fl": "1.KAT", "name": "Firat Aktaş", "rent": 21000, "dep": 21000, "bas": "2026-04-06", "bit": "", "gun": 6, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T7", "unit": "D7", "fl": "1.KAT", "name": "Yiğit Güner", "rent": 20000, "dep": 20000, "bas": "2026-02-20", "bit": "", "gun": 20, "sekil": "Elden", "active": true, "notes": "", "phone": ""}, {"id": "T8", "unit": "D8", "fl": "1.KAT", "name": "Bedirhan Hafizoglu", "rent": 20000, "dep": 20000, "bas": "2000-01-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T9", "unit": "D9", "fl": "1.KAT", "name": "Emir Karadayı", "rent": 20000, "dep": 20000, "bas": "2000-01-16", "bit": "", "gun": 16, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T10", "unit": "D10", "fl": "2.KAT", "name": "Oğuzhan Sönmez", "rent": 19000, "dep": 19000, "bas": "2000-01-15", "bit": "", "gun": 15, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T11", "unit": "D11", "fl": "2.KAT", "name": "Abdurrahman SM Bey", "rent": 17000, "dep": 17000, "bas": "2000-01-30", "bit": "", "gun": 30, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T12", "unit": "D12", "fl": "2.KAT", "name": "Aile Kızı", "rent": 20000, "dep": 20000, "bas": "2000-01-19", "bit": "", "gun": 19, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T13", "unit": "D13", "fl": "2.KAT", "name": "Razzan Taher", "rent": 20000, "dep": 20000, "bas": "2000-01-03", "bit": "", "gun": 3, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T14", "unit": "D14", "fl": "3.KAT", "name": "Murat Can Erdem", "rent": 19000, "dep": 19000, "bas": "2000-01-27", "bit": "", "gun": 27, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T15", "unit": "D15", "fl": "3.KAT", "name": "Ali Bey İranlı", "rent": 20000, "dep": 20000, "bas": "2000-01-29", "bit": "", "gun": 29, "sekil": "Elden", "active": true, "notes": "", "phone": ""}, {"id": "T16", "unit": "D16", "fl": "3.KAT", "name": "Görkem Bey", "rent": 20000, "dep": 20000, "bas": "2000-01-01", "bit": "", "gun": 1, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T17", "unit": "D17", "fl": "3.KAT", "name": "Yusuf Can Günana", "rent": 20000, "dep": 20000, "bas": "2000-01-09", "bit": "", "gun": 9, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T18", "unit": "D18", "fl": "4.KAT", "name": "Neslihan Yalçın", "rent": 20000, "dep": 20000, "bas": "2000-01-16", "bit": "", "gun": 16, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T19", "unit": "D19", "fl": "4.KAT", "name": "Umur Banarlı", "rent": 20000, "dep": 20000, "bas": "2000-01-03", "bit": "", "gun": 3, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T20", "unit": "D20", "fl": "4.KAT", "name": "Merve Sazoğlu", "rent": 20000, "dep": 20000, "bas": "2000-01-02", "bit": "", "gun": 2, "sekil": "Elden", "active": true, "notes": "", "phone": ""}, {"id": "T21", "unit": "D21", "fl": "4.KAT", "name": "Hüseyin Korkmaz", "rent": 20000, "dep": 20000, "bas": "2000-01-25", "bit": "", "gun": 25, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T22", "unit": "D22", "fl": "ÇATI", "name": "Sefer kağit", "rent": 19000, "dep": 19000, "bas": "2026-04-02", "bit": "", "gun": 2, "sekil": "", "active": true, "notes": "", "phone": ""}, {"id": "T23", "unit": "D23", "fl": "ÇATI", "name": "Serhat Satı", "rent": 19000, "dep": 19000, "bas": "2000-01-20", "bit": "", "gun": 20, "sekil": "", "active": true, "notes": "", "phone": ""}]};

// ── Alper table (exact from Excel) ──────────────────────
const BASE_ALPER={
  'Ocak 2025':  {net:106782,col:119000,exp:12218},
  'Şubat 2025': {net:90173, col:197000,exp:12827},
  'Mart 2025':  {net:87332, col:197000,exp:15668},
  'Nisan 2025': {net:90374, col:197000,exp:12626},
  'Mayıs 2025': {net:64565, col:171000,exp:12435},
  'Haziran 2025':{net:47301,col:175000,exp:55699},
  'Temmuz 2025':{net:60815, col:221000,exp:74185},
  'Ağustos 2025':{net:-14218,col:153000,exp:88218},
  'Eylül 2025': {net:89005, col:255000,exp:35995},
  'Ekim 2025':  {net:104197,col:204000,exp:20803},
  'Kasım 2025': {net:74052, col:195400,exp:18348},
  'Aralık 2025':{net:42440, col:181000,exp:35560},
  'Ocak 2026':  {net:63641, col:183000,exp:35359},
  'Şubat 2026': {net:62392, col:212000,exp:37608},
  'Mart 2026':  {net:147005,col:288000,exp:35995},
  'Nisan 2026': {net:102000,col:186000,exp:0},
};

// ── TAN SOKAK net from Excel ─────────────────────────────
const BASE_TANNET={
  'Ocak 2026':  {net:251412,col:290000,exp:38588,kur:45.64,eur:5508.59},
  'Şubat 2026': {net:372412,col:411000,exp:38588,kur:45.64,eur:8159.77},
  'Mart 2026':  {net:298412,col:354000,exp:55588,kur:45.64,eur:6538.39},
  'Nisan 2026': {net:337612,col:376200,exp:38588,kur:45.64,eur:7397.28},
  'Mayıs 2026': {net:41412, col:80000, exp:38588,kur:45.64,eur:907.36},
};

// ── GAYRETTEPE net from Excel ────────────────────────────
const BASE_GAYNET={
  'Mart 2025':  {net:443141,col:516500,exp:73359,kur:51.25,eur:8646.65},
  'Nisan 2025': {net:51000, col:51000, exp:0,    kur:51.25,eur:995.12},
};

// ── WA LOG ───────────────────────────────────────────────
let WA_LOG=[];

// ── LIVE DATA ────────────────────────────────────────────
function initData(){
  if(!PRODUCTION_MODE){
    return {
      tenants:   JSON.parse(JSON.stringify(BASE_TENANTS)),
      payments:  JSON.parse(JSON.stringify(BASE_PAYMENTS)),
      expenses:  JSON.parse(JSON.stringify(BASE_EXPENSES)),
      alper:     JSON.parse(JSON.stringify(BASE_ALPER)),
      tanNet:    JSON.parse(JSON.stringify(BASE_TANNET)),
      gayNet:    JSON.parse(JSON.stringify(BASE_GAYNET)),
      history:   [],
      cloud:     {url:'',key:'',enabled:false,lastSync:''},
      settings:  {autoSave:true},
      waLog:     [],
      users:     JSON.parse(JSON.stringify(DEFAULT_USERS)),
    };
  }
  return {
    tenants:   Object.fromEntries(BK.map(b=>[b,[]])),
    payments:  {},
    expenses:  Object.fromEntries(BK.map(b=>[b,{}])),
    alper:     {},
    tanNet:    {},
    gayNet:    {},
    history:   [],
    cloud:     {url:'',key:'',enabled:false,lastSync:''},
    settings:  {autoSave:true},
    waLog:     [],
    users:     JSON.parse(JSON.stringify(DEFAULT_USERS)),
  };
}
let DATA=initData();

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let S={
  page:'dash', bld:null,
  month:'Nisan 2026',
  search:'',
  syncing:false,
};

// ═══════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════
const LSKEY='ktp_v5';

function loadLocal(){
  try{
    const raw=localStorage.getItem(LSKEY);
    if(!raw) return;
    const p=JSON.parse(raw);
    if(p.tenants)  DATA.tenants  = p.tenants;
    if(p.payments) DATA.payments = p.payments;
    if(p.expenses) DATA.expenses = p.expenses;
    if(p.alper)    DATA.alper    = p.alper;
    if(p.tanNet)   DATA.tanNet   = p.tanNet;
    if(p.gayNet)   DATA.gayNet   = p.gayNet;
    if(p.history)  DATA.history  = p.history;
    if(p.cloud)    DATA.cloud    = p.cloud;
    if(p.settings) DATA.settings = p.settings;
    if(p.waLog)    DATA.waLog    = p.waLog;
    if(p.users)    DATA.users    = p.users;
  }catch(e){console.error('loadLocal',e);}
}

function saveLocal(){
  try{
    localStorage.setItem(LSKEY, JSON.stringify(DATA));
    const t=new Date();
    const lbl=document.getElementById('save-lbl');
    if(lbl) lbl.textContent=`Kaydedildi ${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
  }catch(e){console.error('saveLocal',e);}
}

function manualSave(){saveLocal();toast('💾 Kaydedildi','green');}

function addHist(desc){
  const user=currentUser?currentUser.name:'Sistem';
  DATA.history.unshift({t:new Date().toLocaleString('tr-TR'),desc,user});
  if(DATA.history.length>500) DATA.history.length=500;
  saveLocal();
}

// ═══════════════════════════════════════════════
// CLOUD SYNC
// ═══════════════════════════════════════════════
async function cloudSync(dir='push'){
  const url = DATA.cloud.url;
  const token = DATA.cloud.token || DATA.cloud.key; // support both auth methods
  if(!url){ toast('⚠️ Bulut URL eksik','red'); return; }
  S.syncing=true; updateCloudUI();

  try{
    // ── v2: token-based auth (new server) ──────────────────
    const headers = {
      'Content-Type':'application/json',
      'Authorization': token ? 'Bearer '+token : ''
    };

    if(dir==='push'){
      const payload = {
        tenants:DATA.tenants, payments:DATA.payments,
        expenses:DATA.expenses, alper:DATA.alper,
        history:DATA.history, waLog:DATA.waLog,
        users:DATA.users, settings:DATA.settings
      };
      const body = JSON.stringify({
        payload,
        clientVersion: DATA.cloud.serverVersion || 0
      });
      const r = await fetchWithRetry(url+'/sync', {
        method:'POST', headers, body
      });
      if(r.status===409){
        // Conflict — pull first, then user can retry
        const conflictData = await r.json();
        toast('⚠️ Çakışma: sunucu daha yeni (v'+conflictData.serverVersion+'). Pull ile güncelle.','red');
        addHist('Bulut çakışma: sunucu v'+conflictData.serverVersion+', istemci v'+conflictData.clientVersion);
        S.syncing=false; updateCloudUI(); return;
      }
      if(!r.ok) throw new Error('HTTP '+r.status+' '+(await r.text().catch(()=>'')));
      const res = await r.json();
      DATA.cloud.serverVersion = res.version;
      DATA.cloud.lastSync = new Date().toISOString();
      DATA.cloud.enabled = true;
      saveLocal();
      toast('☁️ Push tamam (v'+res.version+')','blue');
      addHist('Bulut push: v'+res.version+' ('+Math.round(res.bytes/1024)+'KB)');

    } else { // pull
      const r = await fetchWithRetry(url+'/sync', { headers });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const remote = await r.json();
      if(!remote.payload) { toast('☁️ Sunucuda veri yok','orange'); S.syncing=false; updateCloudUI(); return; }
      const d = remote.payload;
      if(d.tenants)  DATA.tenants  = d.tenants;
      if(d.payments) DATA.payments = d.payments;
      if(d.expenses) DATA.expenses = d.expenses;
      if(d.alper)    DATA.alper    = d.alper;
      if(d.history)  DATA.history  = d.history;
      if(d.waLog)    DATA.waLog    = d.waLog;
      // Don't overwrite local users from server — use server /users endpoint
      DATA.cloud.serverVersion = remote.version;
      DATA.cloud.lastSync = new Date().toISOString();
      DATA.cloud.enabled = true;
      autoRecalc(); saveLocal(); render(); updateBadges();
      toast('☁️ Pull tamam (v'+remote.version+')','blue');
      addHist('Bulut pull: v'+remote.version+' ('+(remote.updatedBy||'?')+')');
    }

  }catch(e){
    const msg = e.message || 'Bilinmeyen hata';
    toast('⚠️ Bulut hatası: '+msg,'red');
    addHist('Bulut hatası ('+dir+'): '+msg);
    // Don't lose local data on server failure
  }finally{
    S.syncing=false;
    updateCloudUI();
  }
}

// ── Fetch with retry (1 retry on network error) ──────────────
async function fetchWithRetry(url, opts, retries=1){
  try{ return await fetch(url, opts); }
  catch(e){
    if(retries<=0) throw e;
    await new Promise(r=>setTimeout(r,1500));
    return fetchWithRetry(url, opts, retries-1);
  }
}

// ── Login to server ───────────────────────────────────────────
async function cloudLogin(url, username, password){
  try{
    const r = await fetch(url+'/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, password})
    });
    const data = await r.json();
    if(!r.ok) return {ok:false, error: data.error||'Login failed'};
    return {ok:true, token: data.token, user: data.user};
  }catch(e){ return {ok:false, error: e.message}; }
}

// ── Check server health ───────────────────────────────────────
async function checkServerHealth(url){
  try{
    const r = await fetch(url+'/health', {signal: AbortSignal.timeout(5000)});
    if(!r.ok) return {ok:false, error:'HTTP '+r.status};
    return {ok:true, ...(await r.json())};
  }catch(e){ return {ok:false, error: e.message}; }
}


function updateCloudUI(){
  const dot=document.getElementById('cloud-dot');
  const lbl=document.getElementById('cloud-title');
  const sub=document.getElementById('cloud-sub');
  if(!dot) return;
  const lastSync = DATA.cloud.lastSync ? new Date(DATA.cloud.lastSync).toLocaleTimeString('tr-TR') : '';
  if(S.syncing){
    dot.className='cloud-dot sync';lbl.textContent='Senkron...';if(sub) sub.textContent='Bekleyin';
  } else if(DATA.cloud.enabled&&DATA.cloud.url){
    dot.className='cdot ok';lbl.textContent='Bulut Bağlı';
    const d=DATA.cloud.lastSync?new Date(DATA.cloud.lastSync).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'';
    sub.textContent=d?'Son: '+d:'Aktif';
  } else {
    dot.className='cdot off';lbl.textContent='Bulut Yok';sub.textContent='Yerel mod';
  }
}

// ═══════════════════════════════════════════════
// LOGIN SYSTEM
// ═══════════════════════════════════════════════
function renderLogin(){
  const users=DATA.users&&DATA.users.length?DATA.users:DEFAULT_USERS;
  const c=document.getElementById('login-users');
  c.innerHTML=users.map(u=>`
    <button class="login-user-btn" onclick="selectUser('${u.id}')">
      <div class="login-avatar" style="background:${u.color}">${u.avatar}</div>
      <div class="login-user-info">
        <div class="login-user-name">${u.name}</div>
        <div class="login-user-role">${roleLabel(u.role)}</div>
      </div>
      <div style="color:var(--text3);font-size:16px">›</div>
    </button>
  `).join('');
}

function roleLabel(r){
  return r==='admin'?'👑 Yönetici (Admin)':r==='manager'?'🔑 Yönetici (Müdür)':'👁️ Görüntüleyici';
}

function selectUser(uid){
  const users=DATA.users&&DATA.users.length?DATA.users:DEFAULT_USERS;
  loginSelectedUser=users.find(u=>u.id===uid);
  if(!loginSelectedUser) return;
  document.getElementById('pin-wrap').style.display='block';
  document.getElementById('pin-inp').value='';
  document.getElementById('login-err').textContent='';
  setTimeout(()=>document.getElementById('pin-inp').focus(),100);
}

function checkPin(){
  const inp=document.getElementById('pin-inp');
  const val=inp.value;
  if(val.length<4) return;
  if(val===loginSelectedUser.pin){
    currentUser=loginSelectedUser;
    document.getElementById('login-screen').style.display='none';
    initApp();
  } else {
    document.getElementById('login-err').textContent='❌ PIN hatalı';
    inp.value='';
    setTimeout(()=>document.getElementById('login-err').textContent='',2000);
  }
}

function logout(){
  currentUser=null;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('pin-wrap').style.display='none';
  document.getElementById('pin-inp').value='';
  renderLogin();
}

function canEdit(){return currentUser&&(currentUser.role==='admin'||currentUser.role==='manager');}
function isAdmin(){return currentUser&&currentUser.role==='admin';}

function initApp(){
  // Update UI for user
  const av=document.getElementById('sb-uav');
  const nm=document.getElementById('sb-uname');
  const rl=document.getElementById('sb-urole');
  if(av){av.textContent=currentUser.avatar;av.style.background=currentUser.color;}
  if(nm) nm.textContent=currentUser.name;
  if(rl) rl.textContent=roleLabel(currentUser.role);

  // Hide add buttons for viewer
  if(!canEdit()){
    const btnIds=['btn-addpay','btn-addexp','btn-addten'];
    btnIds.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  }
  // Hide user management for non-admin
  if(!isAdmin()){
    const nb=document.getElementById('nb-users');
    if(nb) nb.style.display='none';
  }

  updateCloudUI();
  render();
  updateBadges();
  addHist('Giriş yapıldı');
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
const TL=v=>'₺'+Number(v||0).toLocaleString('tr-TR');
const sortU=a=>[...a].sort((a,b)=>(parseInt(a.unit.replace(/\D/g,''))||999)-(parseInt(b.unit.replace(/\D/g,''))||999));

function getP(tid,mo){return ((DATA.payments||{})[tid]||{})[mo]||{paid:0,date:'',sekil:'',notes:''};}
function setP(tid,mo,d){if(!DATA.payments[tid])DATA.payments[tid]={};DATA.payments[tid][mo]=d;}

function getStatus(t,mo){
  if(!t.active||t.rent===0) return {lbl:'BOŞ',cls:'b-gray'};
  const p=getP(t.id,mo);
  if(p.paid>=t.rent) return {lbl:'Ödendi',cls:'b-green'};
  if(p.paid>0) return {lbl:'Kısmi',cls:'b-orange'};
  return {lbl:'Ödenmedi',cls:'b-red'};
}

function expTotal(bld,mo){return ((DATA.expenses[bld]||{})[mo]||[]).reduce((s,e)=>s+(e.tutar||0),0);}
function paidTotal(bld,mo){return (DATA.tenants[bld]||[]).filter(t=>t.active&&t.rent>0).reduce((s,t)=>s+getP(t.id,mo).paid,0);}
function rentTotal(bld){return (DATA.tenants[bld]||[]).filter(t=>t.active&&t.rent>0).reduce((s,t)=>s+t.rent,0);}

function isDue(t,mo){
  if(!t.active||t.rent===0) return false;
  if(getP(t.id,mo).paid>=t.rent) return false;
  const now=new Date();
  const [mName,yr]=mo.split(' ');
  const mi=MONTHS.indexOf(mName);
  if(mi<0) return false;
  const dueDate=new Date(parseInt(yr),mi,t.gun||1);
  const overdue=new Date(parseInt(yr),mi,(t.gun||1)+1);
  return now>=overdue;
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function goto(page,bld){
  S.page=page; S.bld=bld||null; S.search='';
  document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
  const idMap={dash:'nb-dash',pay:'nb-pay',exp:'nb-exp',alper:'nb-alper',
    charts:'nb-charts',wa:'nb-wa',rep:'nb-rep',hist:'nb-hist',viz:'nb-viz',
    bld:bld?'nb-'+BS[bld]:''};
  const el=document.getElementById(idMap[page]);
  if(el) el.classList.add('active');
  const titles={dash:'📊 Dashboard',pay:'💳 Tüm Ödemeler',exp:'💸 Tüm Giderler',
    alper:'🤝 Alper Hesabı',charts:'📈 Grafikler',wa:'💬 WhatsApp',
    rep:'📄 Raporlar',hist:'🕐 Geçmiş',viz:'🌐 3D Görünüm',
    bld:'🏢 '+(BL[bld]||bld)};
  const ptEl=document.getElementById('topbar-title');
  if(ptEl) ptEl.textContent=titles[page]||page;
  render();updateBadges();
}

function updateBadges(){
  BK.forEach(b=>{
    const short=BS[b];
    const cnt=(DATA.tenants[b]||[]).filter(t=>{
      if(!t.active||t.rent===0) return false;
      return getP(t.id,S.month).paid<t.rent;
    }).length;
    const el=document.getElementById('bdg-'+short);
    if(el){el.textContent=cnt;el.style.display=cnt?'':'none';}
  });
}

// ═══════════════════════════════════════════════
// MONTH BAR
// ═══════════════════════════════════════════════
function monthBar(){
  const scrollId='mbar-'+Math.random().toString(36).slice(2,7);
  let inner='';
  YEARS.forEach(y=>{
    inner+=`<span class="year-tag">${y}</span>`;
    MONTHS.forEach(m=>{
      const ms=m+' '+y;
      inner+=`<button class="mbtn${S.month===ms?' active':''}" data-month="${ms}" onclick="setMo('${ms}')">${m.slice(0,3)}</button>`;
    });
    inner+='<span class="mbar-sep"></span>';
  });

  return `<div class="mbar-outer">
    <button class="mbar-arrow" id="${scrollId}-l" onclick="mbarScroll('${scrollId}',-160)" aria-label="Önceki aylar">‹</button>
    <div class="period-bar" id="${scrollId}" role="region" aria-label="Dönem seçici"
         onwheel="mbarWheel(event,this)"
         onmousedown="mbarDragStart(event,this)"
         onmousemove="mbarDragMove(event,this)"
         onmouseup="mbarDragEnd(this)"
         onmouseleave="mbarDragEnd(this)">
      <span class="period-label">📅</span>
      ${inner}
    </div>
    <button class="mbar-arrow" id="${scrollId}-r" onclick="mbarScroll('${scrollId}',160)" aria-label="Sonraki aylar">›</button>
  </div>`;
}

function setMo(m){
  S.month=m;
  // Scroll active month into view after render
  render();updateBadges();
  setTimeout(()=>{
    const active=document.querySelector('.mbtn.active');
    if(active) active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  },50);
}

// ── Month bar: drag-to-scroll with momentum/inertia ──────────
const _mbar={
  dragging:false,startX:0,scrollLeft:0,el:null,
  velX:0,lastX:0,lastT:0,rafId:null
};

function mbarDragStart(e,el){
  // Cancel any ongoing momentum
  if(_mbar.rafId){cancelAnimationFrame(_mbar.rafId);_mbar.rafId=null;}
  _mbar.dragging=true;_mbar.el=el;
  _mbar.startX=e.pageX-el.offsetLeft;
  _mbar.scrollLeft=el.scrollLeft;
  _mbar.velX=0;_mbar.lastX=e.pageX;_mbar.lastT=Date.now();
  el.classList.add('is-dragging');
  e.preventDefault();
}
function mbarDragMove(e,el){
  if(!_mbar.dragging||_mbar.el!==el) return;
  e.preventDefault();
  const now=Date.now();
  const dt=Math.max(now-_mbar.lastT,1);
  const dx=e.pageX-_mbar.lastX;
  // Exponential moving average velocity (px/ms)
  _mbar.velX=_mbar.velX*0.7+dx/dt*0.3;
  _mbar.lastX=e.pageX;_mbar.lastT=now;
  const x=e.pageX-el.offsetLeft;
  el.scrollLeft=_mbar.scrollLeft-(x-_mbar.startX);
}
function mbarDragEnd(el){
  if(!_mbar.dragging) return;
  _mbar.dragging=false;
  if(el) el.classList.remove('is-dragging');
  // Apply momentum (inertia scroll)
  const vel=_mbar.velX*18; // scale velocity
  if(Math.abs(vel)<0.5) return;
  let v=vel;
  function momentum(){
    if(Math.abs(v)<0.2){_mbar.rafId=null;return;}
    el.scrollLeft-=v;
    v*=0.88; // friction
    _mbar.rafId=requestAnimationFrame(momentum);
  }
  _mbar.rafId=requestAnimationFrame(momentum);
}
function mbarWheel(e,el){
  e.preventDefault();
  // Cancel momentum on wheel
  if(_mbar.rafId){cancelAnimationFrame(_mbar.rafId);_mbar.rafId=null;}
  const delta=(e.deltaY||e.deltaX);
  // Smooth step
  el.scrollBy({left:delta*1.2,behavior:'auto'});
}
function mbarScroll(id,delta){
  const el=document.getElementById(id);
  if(el) el.scrollBy({left:delta,behavior:'smooth'});
}

// Keyboard arrow support on month bar
document.addEventListener('keydown',e=>{
  const onMbar=document.activeElement&&document.activeElement.classList.contains('mbtn');
  if(!onMbar) return;
  const idx=ALL_MONTHS.indexOf(S.month);
  if(e.key==='ArrowRight'&&idx<ALL_MONTHS.length-1){e.preventDefault();setMo(ALL_MONTHS[idx+1]);}
  if(e.key==='ArrowLeft'&&idx>0){e.preventDefault();setMo(ALL_MONTHS[idx-1]);}
});

// ═══════════════════════════════════════════════
// RENDER DISPATCHER
// ═══════════════════════════════════════════════
function render(){
  const c=document.getElementById('content');
  if(!c) return;
  c.className='fade';void c.offsetWidth;
  const pages={dash:renderDash,pay:renderPay,exp:renderExp,
    alper:renderAlper,charts:renderCharts,wa:renderWA,
    rep:renderRep,hist:renderHist,viz:renderViz,bld:()=>renderBld(S.bld)};
  c.innerHTML=(pages[S.page]||renderDash)();
  if(S.page==='charts') initCharts();
  if(S.page==='viz') initViz();
  if(DATA.settings.autoSave) saveLocal();
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function renderDash(){
  const m=S.month;
  let tRent=0,tPaid=0,tExp=0;

  const brows=BK.map(b=>{
    const ts=(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0);
    const rent=ts.reduce((s,t)=>s+t.rent,0);
    const paid=paidTotal(b,m);
    const ex=expTotal(b,m);
    const net=paid-ex;
    const unpaid=ts.filter(t=>getP(t.id,m).paid<t.rent).length;
    tRent+=rent;tPaid+=paid;tExp+=ex;
    const pct=rent>0?Math.min(100,Math.round(paid/rent*100)):0;
    return `<tr class="cp" onclick="goto('bld','${b}')">
      <td><b>${BL[b]}</b></td>
      <td class="c-muted">${ts.length}</td>
      <td class="cb fw7">${TL(rent)}</td>
      <td>
        <div class="${paid>=rent?'c-green':'c-orange'} fw7">${TL(paid)}</div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--${paid>=rent?'green':'orange'})"></div></div>
      </td>
      <td class="${unpaid?'c-red':'c-green'}">${unpaid?'⚠️ '+unpaid:' ✅'}</td>
      <td class="c-orange">${TL(ex)}</td>
      <td class="${net>=0?'c-green':'c-red'} fw7">${TL(net)}</td>
      <td><span class="badge b-blue">Görüntüle →</span></td>
    </tr>`;
  }).join('');

  const net=tPaid-tExp;
  const now=new Date();

  // Contract alerts (60 days)
  let alerts='';
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>t.active&&t.bit).forEach(t=>{
    const bit=new Date(t.bit);
    const days=Math.ceil((bit-now)/864e5);
    if(days>=0&&days<=60)
      alerts+=`<tr><td><b>${BL[b]}</b></td><td>${t.unit}</td><td>${t.name}</td>
        <td>${t.bit}</td>
        <td class="${days<=30?'c-red':'c-orange'} fw7">${days} gün</td>
        <td class="c-blue">${TL(t.rent)}</td></tr>`;
  }));

  // Overdue
  let overdue='';
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>isDue(t,m)).forEach(t=>{
    overdue+=`<tr><td><b>${BL[b]}</b></td><td>${t.unit}</td>
      <td><span class="blink">🔴</span> <b>${t.name}</b></td>
      <td class="c-orange">Her ayın ${t.gun}.</td>
      <td class="cr fw7">${TL(t.rent)}</td>
      <td>${canEdit()?`<button class="btn btn-xs bsu-" onclick="openMod('pay-add','${b}:${t.id}')">💳 Gir</button>`:''}
          <button class="btn btn-xs bg-" onclick="waMsg('${b}','${t.id}','${m}')">💬 WA</button></td></tr>`;
  }));

  return monthBar()+`
  <div class="kpi-grid">
    <div class="kpi-card" style="--kpi-color:var(--accent)"><div class="kpi-icon">💰</div><div class="kpi-value">${TL(tRent)}</div><div class="kpi-label">Toplam Kira — ${m}</div></div>
    <div class="kpi-card" style="--kpi-color:var(--green)"><div class="kpi-icon">✅</div><div class="kpi-value">${TL(tPaid)}</div><div class="kpi-label">Tahsil Edilen</div><div class="card-sub cg">${tRent>0?Math.round(tPaid/tRent*100):0}% tahsil</div></div>
    <div class="kpi-card" style="--kpi-color:var(--red)"><div class="kpi-icon">❌</div><div class="kpi-value">${TL(tRent-tPaid)}</div><div class="kpi-label">Tahsil Edilmedi</div></div>
    <div class="kpi-card" style="--kpi-color:var(--orange)"><div class="kpi-icon">💸</div><div class="kpi-value">${TL(tExp)}</div><div class="kpi-label">Toplam Gider</div></div>
    <div class="kpi-card" style="--kpi-color:${net>=0?'var(--green)':'var(--red)'}"><div class="kpi-icon">📈</div><div class="kpi-value">${TL(net)}</div><div class="kpi-label">Net Gelir</div></div>
  </div>

  <div class="sec-hdr">🏢 Bina Özeti — ${m}</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Bina</th><th>Kiracı</th><th>Kira</th><th>Tahsilat</th><th>Borçlu</th><th>Gider</th><th>Net</th><th></th></tr></thead>
    <tbody>${brows}</tbody>
  </table></div></div>

  ${overdue?`<div class="sec-hdr">⚠️ Gecikmiş Ödemeler</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Bina</th><th>Daire</th><th>Kiracı</th><th>Ödeme Günü</th><th>Kira</th><th></th></tr></thead>
    <tbody>${overdue}</tbody>
  </table></div></div>`:''}

  ${alerts?`<div class="sec-hdr">📋 Kontrat Bitiş (60 gün)</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Bina</th><th>Daire</th><th>Kiracı</th><th>Bitiş</th><th>Kalan</th><th>Kira</th></tr></thead>
    <tbody>${alerts}</tbody>
  </table></div></div>`:''}`;
}

// ═══════════════════════════════════════════════
// BUILDING PAGE
// ═══════════════════════════════════════════════
function renderBld(bname){
  if(!bname) return '';
  const m=S.month;
  const tenants=sortU(DATA.tenants[bname]||[]);
  const active=tenants.filter(t=>t.active&&t.rent>0);
  const rent=active.reduce((s,t)=>s+t.rent,0);
  const paid=paidTotal(bname,m);
  const ex=expTotal(bname,m);
  const net=paid-ex;
  const exps=((DATA.expenses[bname]||{})[m]||[]);
  const q=(S.search||'').toLowerCase();
  const filtered=tenants.filter(t=>!q||t.name.toLowerCase().includes(q)||t.unit.toLowerCase().includes(q));

  const rows=filtered.map(t=>{
    const st=getStatus(t,m);
    const p=getP(t.id,m);
    const diff=p.paid-(t.rent||0);
    const late=isDue(t,m);
    return `<tr class="cp" onclick="openPanel('${bname}','${t.id}')">
      <td><b>${t.unit}</b><span class="c-muted" style="font-size:10px;margin-left:4px">${t.fl||''}</span></td>
      <td>${late?'<span class="blink">🔴</span> ':''}<b>${t.name||'—'}</b>${t.notes?` <span style="color:var(--text3);font-size:10px" title="${t.notes}">ⓘ</span>`:''}</td>
      <td class="cb fw7">${t.rent?TL(t.rent):'—'}</td>
      <td class="${p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red'} fw7">${t.rent?TL(p.paid):'—'}</td>
      <td class="${diff>0?'c-green':diff<0?'c-red':'c-muted'}">${t.rent?(diff>0?'+':'')+TL(diff):'—'}</td>
      <td><span class="badge ${st.cls}">${st.lbl}</span></td>
      <td class="c-muted">${p.date?p.date.slice(0,10):'—'}</td>
      <td class="c-muted">${p.sekil||'—'}</td>
      <td class="nowrap">
        ${canEdit()?`<button class="btn btn-xs bsu- " onclick="event.stopPropagation();openMod('pay-add','${bname}:${t.id}')">💳</button>
        <button class="btn btn-xs bg-" onclick="event.stopPropagation();openMod('ten-edit','${bname}:${t.id}')">✏️</button>`:''}
        <button class="btn btn-xs bg-" onclick="event.stopPropagation();waMsg('${bname}','${t.id}','${m}')">💬</button>
      </td>
    </tr>`;
  }).join('');

  const expRows=exps.map((e,i)=>`<tr>
    <td class="mono ${canEdit()?'editable':''}" ondblclick="if(canEdit())makeEditable(this,v=>{((DATA.expenses['${bname}']||{})['${m}']||[])[${i}].no=v;saveLocal();toast('✅','green');})">${e.no||'—'}</td>
    <td class="fw7 ${canEdit()?'editable':''}" ondblclick="if(canEdit())makeEditable(this,v=>{((DATA.expenses['${bname}']||{})['${m}']||[])[${i}].tur=v.toUpperCase();saveLocal();toast('✅','green');})">${e.tur}</td>
    <td class="co fw7 ${canEdit()?'editable':''}" title="Çift tıkla düzenle" ondblclick="if(canEdit())makeEditable(this,v=>{const n=parseInt(v.replace(/[^0-9]/g,''));if(!isNaN(n)){((DATA.expenses['${bname}']||{})['${m}']||[])[${i}].tutar=n;autoRecalc();saveLocal();render();}});">${TL(e.tutar)}</td>
    <td class="cm ${canEdit()?'editable':''}" ondblclick="if(canEdit())makeEditable(this,v=>{((DATA.expenses['${bname}']||{})['${m}']||[])[${i}].tarih=v;saveLocal();})">${e.tarih||'—'}</td>
    <td class="cm ${canEdit()?'editable':''}" ondblclick="if(canEdit())makeEditable(this,v=>{((DATA.expenses['${bname}']||{})['${m}']||[])[${i}].notlar=v;saveLocal();})">${e.notlar||''}</td>
    <td class="nowrap">${canEdit()?`
      <button class="btn btn-xs bg-" onclick="editExp('${bname}','${m}',${i})">✏️</button>
      <button class="btn btn-xs bd-" onclick="delExp('${bname}','${m}',${i})">🗑</button>`:''}
    </td>
  </tr>`).join('');

  return monthBar()+`
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input type="text" class="form-input" style="width:200px" placeholder="🔍 Daire/kiracı..." oninput="S.search=this.value;render()" value="${S.search}">
    <div style="flex:1"></div>
    ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="openMod('ten-add','${bname}')">+ Kiracı</button>
    <button class="btn btn-secondary btn-sm" onclick="openMod('pay-add','${bname}')">+ Ödeme</button>
    <button class="btn btn-secondary btn-sm" onclick="openMod('exp-add','${bname}')">+ Gider</button>`:''}
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️</button>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card" style="--kpi-color:var(--accent)"><div class="kpi-icon">👤</div><div class="kpi-value">${active.length}</div><div class="kpi-label">Aktif Kiracı</div></div>
    <div class="kpi-card" style="--kpi-color:var(--accent)"><div class="kpi-icon">💰</div><div class="kpi-value">${TL(rent)}</div><div class="kpi-label">Toplam Kira</div></div>
    <div class="kpi-card" style="--kpi-color:var(--green)"><div class="kpi-icon">✅</div><div class="kpi-value">${TL(paid)}</div><div class="kpi-label">Tahsil</div></div>
    <div class="kpi-card" style="--kpi-color:var(--orange)"><div class="kpi-icon">💸</div><div class="kpi-value">${TL(ex)}</div><div class="kpi-label">Gider</div></div>
    <div class="kpi-card" style="--kpi-color:${net>=0?'var(--green)':'var(--red)'}"><div class="kpi-icon">📈</div><div class="kpi-value">${TL(net)}</div><div class="kpi-label">Net</div></div>
  </div>

  <div class="table-card">
    <div class="table-card-header"><h3>🏠 Daireler — ${m}</h3><span class="c-muted" style="font-size:11px">Tıklayın → detay</span></div>
    <div class="table-scroller"><table>
      <thead><tr><th>Daire</th><th>Kiracı</th><th>Kira</th><th>Ödenen</th><th>Fark</th><th>Durum</th><th>Tarih</th><th>Şekil</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="9" class="empty-state-text">Kayıt yok</td></tr>`}
      ${active.length?`<tr class="tfoot-row">
        <td colspan="2">TOPLAM (${active.length})</td>
        <td class="c-blue">${TL(rent)}</td>
        <td class="${paid>=rent?'c-green':'c-orange'}">${TL(paid)}</td>
        <td class="${paid-rent>=0?'c-green':'c-red'}">${TL(paid-rent)}</td>
        <td colspan="4"></td>
      </tr>`:''}
      </tbody>
    </table></div>
  </div>

  <div class="table-card">
    <div class="table-card-header">
      <h3>💸 Giderler — ${m}</h3>
      ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="openMod('exp-add','${bname}')">+ Ekle</button>`:''}
    </div>
    <div class="table-scroller"><table>
      <thead><tr><th>Sayaç/No</th><th>Gider Türü</th><th>Tutar</th><th>Tarih</th><th>Not</th><th></th></tr></thead>
      <tbody>${expRows||`<tr><td colspan="6" class="empty-state-text">Bu ay gider yok</td></tr>`}
      ${exps.length?`<tr class="tfoot-row"><td colspan="2">TOPLAM GİDER</td><td class="c-orange">${TL(ex)}</td><td colspan="3"></td></tr>
      <tr class="tfoot-row"><td colspan="2">TAHSİLAT − GİDER = NET</td><td class="${net>=0?'c-green':'c-red'} fw8">${TL(net)}</td><td colspan="3"></td></tr>`:''}
      </tbody>
    </table></div>
  </div>`;
}

// ═══════════════════════════════════════════════
// TENANT PANEL
// ═══════════════════════════════════════════════
function openPanel(bname,tid){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  const m=S.month;
  const p=getP(tid,m);
  const st=getStatus(t,m);
  const diff=p.paid-(t.rent||0);

  // Build history
  const histRows=ALL_MONTHS.filter(mo=>{
    const pp=((DATA.payments[tid]||{})[mo]);
    return pp!==undefined;
  }).slice(-18).reverse().map(mo=>{
    const pp=getP(tid,mo);
    const dot=pp.paid>=(t.rent||0)?'var(--green)':pp.paid>0?'var(--orange)':'var(--red)';
    return `<div class="tl-item">
      <div class="tl-dot" style="background:${dot}"></div>
      <div style="flex:1"><div class="fw-600" style="font-size:12px">${mo}</div>
      <div style="font-size:10.5px;color:var(--text3)">${pp.date?pp.date.slice(0,10):''} ${pp.sekil||''}${pp.notes?' · '+pp.notes:''}</div></div>
      <div class="fw7 ${pp.paid>=(t.rent||0)?'c-green':pp.paid>0?'c-orange':'c-red'}">${TL(pp.paid)}</div>
    </div>`;
  }).join('');

  document.getElementById('panel').innerHTML=`
    <button class="panel-close" onclick="closePanel()">✕</button>
    <div style="font-size:36px;margin-top:6px">🏠</div>
    <div class="panel-name">${t.name||'BOŞ'}</div>
    <div class="panel-sub">${BL[bname]} — ${t.unit}${t.fl?' ('+t.fl+')':''}</div>
    <span class="badge ${st.cls}">${st.lbl}</span>

    <div class="div-line"></div>
    <div class="sec-hdr">📋 Bu Ay — ${m}</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-lbl">Kira</div><div class="ival cb">${TL(t.rent)}</div></div>
      <div class="info-item"><div class="info-lbl">Ödenen</div><div class="ival ${p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red'}">${TL(p.paid)}</div></div>
      <div class="info-item"><div class="info-lbl">Fark</div><div class="ival ${diff>0?'c-green':diff<0?'c-red':''}">${diff>0?'+':''}${TL(diff)}</div></div>
      <div class="info-item"><div class="info-lbl">Ödeme Tarihi</div><div class="info-val">${p.date?p.date.slice(0,10):'—'}</div></div>
      <div class="info-item"><div class="info-lbl">Şekil</div><div class="info-val">${p.sekil||'—'}</div></div>
      <div class="info-item"><div class="info-lbl">Depozito</div><div class="info-val">${TL(t.dep)}</div></div>
    </div>

    <div class="sec-hdr">📅 Kontrat</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-lbl">Başlangıç</div><div class="info-val">${t.bas||'—'}</div></div>
      <div class="info-item"><div class="info-lbl">Bitiş</div><div class="info-val">${t.bit||'—'}</div></div>
      <div class="info-item"><div class="info-lbl">Ödeme Günü</div><div class="info-val">Her ayın ${t.gun||1}.</div></div>
      <div class="info-item"><div class="info-lbl">Telefon</div><div class="info-val">${t.phone||'—'}</div></div>
    </div>
    ${t.notes?`<div class="info-item" style="margin-bottom:12px"><div class="info-lbl">Notlar</div><div class="info-val" style="font-size:12px">${t.notes}</div></div>`:''}

    <div class="sec-hdr">📊 Ödeme Geçmişi (son 18 ay)</div>
    <div>${histRows||'<div class="c-muted" style="font-size:12px">Kayıt yok</div>'}</div>

    <div class="div-line"></div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="openMod('pay-add','${bname}:${tid}');closePanel()">💳 Ödeme</button>
      <button class="btn btn-ghost btn-sm" onclick="openMod('ten-edit','${bname}:${tid}');closePanel()">✏️ Düzenle</button>
      <button class="btn btn-danger btn-sm" onclick="if(confirm('Çıkarılsın mı?')){removeTen('${bname}','${tid}');closePanel()}">🚫 Çıkar</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="waMsg('${bname}','${tid}','${S.month}')">💬 WA</button>
    </div>
  `;
  document.getElementById('panel-overlay').classList.add('open');
  document.getElementById('panel').classList.add('open');
}
function closePanel(){
  document.getElementById('panel-overlay').classList.remove('open');
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panel').innerHTML='';
}

// ═══════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════
// openModal is the public alias (used in HTML); openMod is internal
function openModal(type,arg){ openMod(type,arg); }

function openMod(type,arg){
  // Non-edit types allowed for all roles
  const noEditTypes=['cloud','users','settings'];
  if(!canEdit()&&!noEditTypes.includes(type)) return;
  const md=document.getElementById('modal');
  const t={
    'pay-add':()=>tplPayAdd(arg||''),
    'exp-add':()=>tplExpAdd(arg||''),
    'ten-add':()=>tplTenAdd(arg||''),
    'ten-edit':()=>tplTenEdit(arg||''),
    'cloud':()=>tplCloud(),
    'users':()=>tplUsers(),
    'settings':()=>tplSettings(),
  };
  // Unknown type → show error state instead of silently using pay-add
  const tplFn = t[type];
  if(!tplFn){
    md.innerHTML=`<div class="modal-title">⚠️ Bilinmeyen İşlem</div>
      <p style="color:var(--ink-3);font-size:13px">"${type}" henüz yapılandırılmamış.</p>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeMod()">Kapat</button></div>`;
  } else {
    md.innerHTML=tplFn();
  }
  document.getElementById('modal-overlay').classList.add('open');
  if(type==='pay-add') setTimeout(()=>{refreshTenSel();if(arg){const[b,id]=arg.split(':');const sel=document.getElementById('m_b');if(sel&&b)sel.value=b;refreshTenSel();if(id){const ks=document.getElementById('m_t');if(ks)ks.value=id;autoRent();}}},50);
}
function closeMod(){document.getElementById('modal-overlay').classList.remove('open');}
function closeMO(e){if(e.target===document.getElementById('modal-overlay'))closeMod();}

// ── PAY ADD ──────────────────────────────────
function tplPayAdd(pre){
  const[pb,pt]=pre.split(':');
  const bOpts=BK.map(b=>`<option value="${b}" ${b===pb?'selected':''}>${BL[b]}</option>`).join('');
  const mOpts=ALL_MONTHS.map(mo=>`<option value="${mo}" ${mo===S.month?'selected':''}>${mo}</option>`).join('');
  return `<div class="modal-title">💳 Ödeme Gir</div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Bina</label><select class="form-select" id="m_b" onchange="refreshTenSel()">${bOpts}</select></div>
    <div class="form-row"><label class="form-label">Dönem</label><select class="form-select" id="m_mo">${mOpts}</select></div>
  </div>
  <div class="form-row"><label class="form-label">Kiracı</label><select class="form-select" id="m_t" onchange="autoRent()"></select></div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödenen (₺)</label><input class="form-input" id="m_amt" type="number" placeholder="0"></div>
    <div class="form-row"><label class="form-label">Tarih</label><input class="form-input" id="m_dt" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödeme Şekli</label><select class="form-select" id="m_sk">${SEKIL.map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="form-row"><label class="form-label">Not</label><input class="form-input" id="m_nt" placeholder="Açıklama..."></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">İptal</button>
    <button class="btn btn-primary" onclick="savePay()">💾 Kaydet</button>
  </div>`;
}

function refreshTenSel(){
  const b=document.getElementById('m_b')?.value;
  const sel=document.getElementById('m_t');
  if(!sel||!b) return;
  const ts=sortU((DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0));
  sel.innerHTML=ts.map(t=>`<option value="${t.id}">${t.unit} – ${t.name}</option>`).join('');
  autoRent();
}

function autoRent(){
  const b=document.getElementById('m_b')?.value;
  const tid=document.getElementById('m_t')?.value;
  const amt=document.getElementById('m_amt');
  if(!b||!tid||!amt) return;
  const t=(DATA.tenants[b]||[]).find(x=>x.id===tid);
  if(t) amt.value=t.rent;
}

function savePay(){
  const b=document.getElementById('m_b')?.value;
  const tid=document.getElementById('m_t')?.value;
  const mo=document.getElementById('m_mo')?.value;
  const paid=parseFloat(document.getElementById('m_amt')?.value)||0;
  const date=document.getElementById('m_dt')?.value||'';
  const sekil=document.getElementById('m_sk')?.value||'Banka';
  const notes=document.getElementById('m_nt')?.value||'';
  if(!b||!tid||!mo) return;
  const t=(DATA.tenants[b]||[]).find(x=>x.id===tid);
  setP(tid,mo,{paid,date,sekil,notes});
  addHist(`${BL[b]} ${t?.unit||''} – ${t?.name||''}: ${TL(paid)} ödeme (${mo})`);
  autoRecalc();
  closeMod();render();updateBadges();
  toast('✅ Ödeme kaydedildi','green');
  if(DATA.cloud.enabled) cloudSync('push');
}

// ── EXP ADD ──────────────────────────────────
function tplExpAdd(pre){
  const pb=pre.split(':')[0]||'';
  const bOpts=BK.map(b=>`<option value="${b}" ${b===pb?'selected':''}>${BL[b]}</option>`).join('');
  const mOpts=ALL_MONTHS.map(mo=>`<option value="${mo}" ${mo===S.month?'selected':''}>${mo}</option>`).join('');
  return `<div class="modal-title">💸 Gider Ekle</div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Bina</label><select class="form-select" id="e_b">${bOpts}</select></div>
    <div class="form-row"><label class="form-label">Dönem</label><select class="form-select" id="e_mo">${mOpts}</select></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Gider Türü</label>
      <input class="form-input" id="e_tur" list="el_gk" placeholder="Elektrik, Su...">
      <datalist id="el_gk">${GKAT.map(k=>`<option value="${k}">`).join('')}</datalist>
    </div>
    <div class="form-row"><label class="form-label">Sayaç / No</label><input class="form-input" id="e_no" placeholder=""></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Tutar (₺)</label><input class="form-input" id="e_amt" type="number" placeholder="0"></div>
    <div class="form-row"><label class="form-label">Tarih</label><input class="form-input" id="e_dt" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  </div>
  <div class="form-row"><label class="form-label">Not</label><input class="form-input" id="e_nt"></div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">İptal</button>
    <button class="btn btn-primary" onclick="saveExp_()">💾 Kaydet</button>
  </div>`;
}

function saveExp_(eb,emo,eidx){
  const b=eb||document.getElementById('e_b')?.value;
  const mo=emo||document.getElementById('e_mo')?.value;
  const tur=(document.getElementById('e_tur')?.value||'').trim().toUpperCase();
  const no=(document.getElementById('e_no')?.value||'').trim();
  const tutar=parseFloat(document.getElementById('e_amt')?.value)||0;
  const tarih=document.getElementById('e_dt')?.value||'';
  const notlar=document.getElementById('e_nt')?.value||'';
  if(!b||!mo||!tur) return;
  if(!DATA.expenses[b]) DATA.expenses[b]={};
  if(!DATA.expenses[b][mo]) DATA.expenses[b][mo]=[];
  const entry={tur,no,tutar,tarih,notlar};
  if(eidx!==undefined) DATA.expenses[b][mo][eidx]=entry;
  else DATA.expenses[b][mo].push(entry);
  addHist(`${BL[b]} gider ${eidx!==undefined?'güncellendi':'eklendi'}: ${tur} ${TL(tutar)} (${mo})`);
  autoRecalc();
  closeMod();render();
  toast('✅ Gider kaydedildi','green');
  if(DATA.cloud.enabled) cloudSync('push');
}

function editExp(bld,mo,idx){
  const e=((DATA.expenses[bld]||{})[mo]||[])[idx];
  if(!e) return;
  openMod('exp-add',bld);
  setTimeout(()=>{
    ['e_b','e_mo','e_tur','e_no','e_amt','e_dt','e_nt'].forEach((id,i)=>{
      const el=document.getElementById(id);
      if(!el) return;
      const vals=[bld,mo,e.tur,e.no||'',e.tutar,e.tarih||'',e.notlar||''];
      el.value=vals[i];
    });
    const sb=document.querySelector('#md .btn.bp-');
    if(sb) sb.onclick=()=>saveExp_(bld,mo,idx);
  },60);
}

function delExp(bld,mo,idx){
  if(!confirm('Silinsin mi?')) return;
  DATA.expenses[bld][mo].splice(idx,1);
  addHist(`${BL[bld]} gider silindi (${mo})`);
  render();toast('🗑 Silindi','red');
}

// ── TENANT ADD ───────────────────────────────
function tplTenAdd(bname){
  const bOpts=BK.map(b=>`<option value="${b}" ${b===bname?'selected':''}>${BL[b]}</option>`).join('');
  return `<div class="modal-title">👤 Kiracı Ekle</div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Bina</label><select class="form-select" id="nt_b">${bOpts}</select></div>
    <div class="form-row"><label class="form-label">Daire No</label><input class="form-input" id="nt_u" placeholder="D1"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Kat</label><input class="form-input" id="nt_fl" placeholder="1.KAT"></div>
    <div class="form-row"><label class="form-label">Ad Soyad *</label><input class="form-input" id="nt_n"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Kira (₺)</label><input class="form-input" id="nt_r" type="number"></div>
    <div class="form-row"><label class="form-label">Depozito (₺)</label><input class="form-input" id="nt_d" type="number" value="0"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Telefon (WA)</label><input class="form-input" id="nt_ph" placeholder="905xxxxxxxxx"></div>
    <div class="form-row"><label class="form-label">Ödeme Günü</label><input class="form-input" id="nt_g" type="number" value="1" min="1" max="31"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Başlangıç</label><input class="form-input" id="nt_bs" type="date"></div>
    <div class="form-row"><label class="form-label">Bitiş</label><input class="form-input" id="nt_bt" type="date"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödeme Şekli</label><select class="form-select" id="nt_sk">${SEKIL.map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="form-row"><label class="form-label">Not</label><input class="form-input" id="nt_nt"></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">İptal</button>
    <button class="btn btn-primary" onclick="saveTen()">💾 Ekle</button>
  </div>`;
}

function saveTen(){
  const b=document.getElementById('nt_b').value;
  const unit=document.getElementById('nt_u').value.trim().toUpperCase();
  const name=document.getElementById('nt_n').value.trim();
  if(!unit||!name) return alert('Daire no ve isim zorunlu!');
  const id=BS[b]+Date.now();
  const t={
    id,unit,
    fl:document.getElementById('nt_fl').value.trim(),
    name,
    rent:parseFloat(document.getElementById('nt_r').value)||0,
    dep:parseFloat(document.getElementById('nt_d').value)||0,
    phone:document.getElementById('nt_ph').value.trim(),
    gun:parseInt(document.getElementById('nt_g').value)||1,
    bas:document.getElementById('nt_bs').value,
    bit:document.getElementById('nt_bt').value,
    sekil:document.getElementById('nt_sk').value,
    notes:document.getElementById('nt_nt').value.trim(),
    active:true,
  };
  if(!DATA.tenants[b]) DATA.tenants[b]=[];
  DATA.tenants[b].push(t);
  addHist(`${BL[b]} ${unit} – ${name} eklendi`);
  closeMod();render();updateBadges();
  toast('✅ Kiracı eklendi','green');
}

// ── TENANT EDIT ──────────────────────────────
function tplTenEdit(arg){
  const[bname,tid]=arg.split(':');
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return '<div>Bulunamadı</div>';
  const mo=S.month;
  const p=getP(tid,mo);
  return `<div class="modal-title">✏️ Kiracı Düzenle — ${t.unit}</div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Daire</label><input class="form-input" id="et_u" value="${t.unit}"></div>
    <div class="form-row"><label class="form-label">Kat</label><input class="form-input" id="et_fl" value="${t.fl||''}"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ad Soyad</label><input class="form-input" id="et_n" value="${t.name}"></div>
    <div class="form-row"><label class="form-label">Telefon (WA)</label><input class="form-input" id="et_ph" value="${t.phone||''}" placeholder="905xxxxxxxxx"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Kira (₺)</label><input class="form-input" id="et_r" type="number" value="${t.rent}"></div>
    <div class="form-row"><label class="form-label">Depozito</label><input class="form-input" id="et_d" type="number" value="${t.dep||0}"></div>
  </div>
  <div class="sec-hdr" style="margin:10px 0 8px">Bu Ay: ${mo}</div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödenen (₺)</label><input class="form-input" id="et_p" type="number" value="${p.paid||0}"></div>
    <div class="form-row"><label class="form-label">Ödeme Tarihi</label><input class="form-input" id="et_pd" type="date" value="${p.date||''}"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödeme Şekli</label><select class="form-select" id="et_ps">${SEKIL.map(s=>`<option ${p.sekil===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="form-row"><label class="form-label">Ödeme Notu</label><input class="form-input" id="et_pn" value="${p.notes||''}"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Kontrat Başlangıç</label><input class="form-input" id="et_bs" type="date" value="${t.bas||''}"></div>
    <div class="form-row"><label class="form-label">Kontrat Bitiş</label><input class="form-input" id="et_bt" type="date" value="${t.bit||''}"></div>
  </div>
  <div class="form-grid-2">
    <div class="form-row"><label class="form-label">Ödeme Günü</label><input class="form-input" id="et_g" type="number" value="${t.gun||1}" min="1" max="31"></div>
    <div class="form-row"><label class="form-label">Genel Ödeme Şekli</label><select class="form-select" id="et_sk">${SEKIL.map(s=>`<option ${t.sekil===s?'selected':''}>${s}</option>`).join('')}</select></div>
  </div>
  <div class="form-row"><label class="form-label">Not</label><input class="form-input" id="et_nt" value="${t.notes||''}"></div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">İptal</button>
    <button class="btn btn-danger btn-sm" onclick="if(confirm('Çıkar?')){removeTen('${bname}','${tid}');closeMod()}">🚫</button>
    <button class="btn btn-primary" onclick="updateTen('${bname}','${tid}','${mo}')">💾 Güncelle</button>
  </div>`;
}

function updateTen(bname,tid,mo){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  t.unit=document.getElementById('et_u').value.trim().toUpperCase();
  t.fl=document.getElementById('et_fl').value.trim();
  t.name=document.getElementById('et_n').value.trim();
  t.phone=document.getElementById('et_ph').value.trim();
  t.rent=parseFloat(document.getElementById('et_r').value)||0;
  t.dep=parseFloat(document.getElementById('et_d').value)||0;
  t.bas=document.getElementById('et_bs').value;
  t.bit=document.getElementById('et_bt').value;
  t.gun=parseInt(document.getElementById('et_g').value)||1;
  t.sekil=document.getElementById('et_sk').value;
  t.notes=document.getElementById('et_nt').value.trim();
  setP(tid,mo,{
    paid:parseFloat(document.getElementById('et_p').value)||0,
    date:document.getElementById('et_pd').value||'',
    sekil:document.getElementById('et_ps').value,
    notes:document.getElementById('et_pn').value||'',
  });
  addHist(`${BL[bname]} ${t.unit} – ${t.name} güncellendi`);
  autoRecalc();
  closeMod();render();updateBadges();
  toast('✅ Güncellendi','green');
  if(DATA.cloud.enabled) cloudSync('push');
}

function removeTen(bname,tid){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  t.active=false;t.rent=0;
  addHist(`${BL[bname]} ${t.unit} – ${t.name} çıkarıldı`);
  render();updateBadges();toast('🚫 Çıkarıldı','red');
}

// ── CLOUD MODAL ──────────────────────────────
function tplCloud(){
  const url  = DATA.cloud.url  || '';
  const user = DATA.cloud.username || '';
  const connected = DATA.cloud.enabled && url;
  const lastSync = DATA.cloud.lastSync ? new Date(DATA.cloud.lastSync).toLocaleString('tr-TR') : '—';
  const sv = DATA.cloud.serverVersion || '—';

  return `<div class="modal-title">☁️ Bulut Senkronizasyonu</div>

  <!-- Status bar -->
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
    background:${connected?'rgba(16,185,129,.08)':'rgba(244,63,94,.06)'};
    border:1px solid ${connected?'rgba(16,185,129,.2)':'rgba(244,63,94,.15)'};
    border-radius:var(--r-md);margin-bottom:14px">
    <div style="width:9px;height:9px;border-radius:50%;
      background:${connected?'var(--emerald)':'var(--rose)'};
      box-shadow:0 0 6px ${connected?'var(--emerald)':'var(--rose)'}"></div>
    <div style="flex:1">
      <div style="font-size:12px;font-weight:600;color:var(--ink-0)">${connected?'Bağlı':'Bağlantı Yok'}</div>
      <div style="font-size:10.5px;color:var(--ink-4)">Son sync: ${lastSync} · Sunucu v${sv}</div>
    </div>
    ${connected?`<button class="btn btn-ghost btn-xs" onclick="checkCloudStatus()">⚡ Test</button>`:''}
  </div>

  <div id="cloud-tabs" style="display:flex;gap:4px;margin-bottom:12px;
    background:var(--glass-light);border:1px solid var(--border-subtle);
    border-radius:var(--r-sm);padding:4px;width:fit-content">
    <button class="a-tab active" id="ct-server" onclick="cloudTab('server',this)">🏠 Kira Takip Sunucu</button>
    <button class="a-tab" id="ct-json" onclick="cloudTab('json',this)">📦 JSON API (eski)</button>
  </div>

  <div id="cloud-tab-server">
    <div class="form-row">
      <label class="form-label">Sunucu URL *</label>
      <input class="form-input" id="c_url" value="${DATA.cloud.serverUrl||url||''}"
        placeholder="http://sunucu-ip:8787">
    </div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row">
        <label class="form-label">Kullanıcı Adı *</label>
        <input class="form-input" id="c_user" value="${DATA.cloud.username||''}" placeholder="malik">
      </div>
      <div class="form-row">
        <label class="form-label">Şifre *</label>
        <input class="form-input" id="c_pass" type="password" placeholder="••••••">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick="cloudLoginAndSave()">🔐 Bağlan</button>
      <button class="btn btn-ghost btn-sm" onclick="checkCloudStatus()">⚡ Sunucu Testi</button>
    </div>
    <div id="cloud-server-msg" style="font-size:12px;min-height:20px;color:var(--ink-3)"></div>
  </div>

  <div id="cloud-tab-json" style="display:none">
    <div style="background:var(--warning-bg);border:1px solid var(--warning-border);
      border-radius:var(--r-sm);padding:10px 12px;font-size:11.5px;color:var(--amber-l);margin-bottom:10px">
      ⚠️ Bu mod eski versiyonlarla uyumluluk için. Yeni kullanıcılar Kira Takip Sunucu seçeneğini kullanmalı.
    </div>
    <div class="form-row">
      <label class="form-label">API URL</label>
      <input class="form-input" id="c_url_json" value="${url}" placeholder="https://api.jsonbin.io/v3/b/...">
    </div>
    <div class="form-row">
      <label class="form-label">API Key / Bearer Token</label>
      <input class="form-input" id="c_key_json" value="${DATA.cloud.key||''}" type="password" placeholder="$2a$10$...">
    </div>
    <button class="btn btn-secondary btn-sm" onclick="saveJsonCloud()">💾 Kaydet</button>
  </div>

  <div class="div-line"></div>

  ${DATA.cloud.token?`
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <button class="btn btn-primary btn-sm" onclick="cloudSync('push');closeMod()">⬆ Push</button>
    <button class="btn btn-secondary btn-sm" onclick="cloudSync('pull').then(()=>closeMod())">⬇ Pull</button>
    <button class="btn btn-ghost btn-sm" onclick="openModal('cloud-logs')">📋 Loglar</button>
    ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="openServerUserMgmt()">👥 Sunucu Kullanıcıları</button>`:''}
  </div>`:`
  <div style="font-size:12px;color:var(--ink-4)">Senkronizasyon için önce bağlanın.</div>
  `}

  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">Kapat</button>
  </div>`;
}

function cloudTab(which, el){
  document.querySelectorAll('#cloud-tabs .a-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cloud-tab-server').style.display = which==='server'?'':'none';
  document.getElementById('cloud-tab-json').style.display = which==='json'?'':'none';
}

async function cloudLoginAndSave(){
  const url  = (document.getElementById('c_url')?.value||'').trim().replace(/\/+$/,'');
  const user = (document.getElementById('c_user')?.value||'').trim();
  const pass = document.getElementById('c_pass')?.value||'';
  const msg  = document.getElementById('cloud-server-msg');
  if(!url||!user||!pass){ msg.textContent='❌ URL, kullanıcı adı ve şifre gerekli'; return; }
  msg.textContent='🔄 Bağlanıyor...'; msg.style.color='var(--ink-3)';
  const result = await cloudLogin(url, user, pass);
  if(!result.ok){ msg.textContent='❌ '+result.error; msg.style.color='var(--rose-l)'; return; }
  // Save auth
  DATA.cloud.serverUrl = url;
  DATA.cloud.url = url;
  DATA.cloud.token = result.token;
  DATA.cloud.key = result.token; // backwards compat
  DATA.cloud.username = user;
  DATA.cloud.enabled = true;
  DATA.cloud.user = result.user;
  saveLocal();
  msg.textContent='✅ Bağlandı: '+result.user.name+' ('+result.user.role+')';
  msg.style.color='var(--emerald-l)';
  updateCloudUI();
  toast('✅ Sunucuya bağlandı','green');
  addHist('Bulut sunucu bağlantısı: '+url+' ('+result.user.name+')');
}

async function checkCloudStatus(){
  const url = (DATA.cloud.serverUrl||DATA.cloud.url||'').replace(/\/+$/,'');
  const msg = document.getElementById('cloud-server-msg');
  if(!url){ if(msg) msg.textContent='❌ URL girilmedi'; return; }
  if(msg){ msg.textContent='🔄 Test ediliyor...'; msg.style.color='var(--ink-3)'; }
  const h = await checkServerHealth(url);
  if(h.ok){
    const txt = `✅ Sunucu aktif · v${h.version} · DB: ${h.db} · Uptime: ${h.uptime}s`;
    if(msg){ msg.textContent=txt; msg.style.color='var(--emerald-l)'; }
    toast('✅ Sunucu bağlantısı OK','green');
  } else {
    const txt = '❌ Sunucu yanıt vermiyor: '+h.error;
    if(msg){ msg.textContent=txt; msg.style.color='var(--rose-l)'; }
    toast('❌ Sunucu bağlantı hatası','red');
  }
}

function saveJsonCloud(){
  DATA.cloud.url = (document.getElementById('c_url_json')?.value||'').trim();
  DATA.cloud.key = (document.getElementById('c_key_json')?.value||'').trim();
  DATA.cloud.token = DATA.cloud.key;
  saveLocal(); updateCloudUI(); closeMod();
  toast('💾 Bağlantı ayarları kaydedildi','green');
}

async function openServerUserMgmt(){
  if(!DATA.cloud.token){ toast('⚠️ Önce sunucuya bağlanın','red'); return; }
  const url = (DATA.cloud.serverUrl||DATA.cloud.url||'').replace(/\/+$/,'');
  closeMod();
  // Fetch users from server
  try{
    const r = await fetch(url+'/users', {headers:{'Authorization':'Bearer '+DATA.cloud.token}});
    if(!r.ok){ toast('❌ Sunucu kullanıcıları alınamadı: '+r.status,'red'); return; }
    const data = await r.json();
    renderServerUserMgmt(data.users, url);
  }catch(e){ toast('❌ '+e.message,'red'); }
}

function renderServerUserMgmt(users, url){
  const content = document.getElementById('content');
  const rows = (users||[]).map(u=>`<tr>
    <td>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:${u.color||'#3b82f6'};
          display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:12px">${u.avatar||u.name[0]}</div>
        <div>
          <div style="font-weight:600">${u.name}</div>
          <div style="font-size:11px;color:var(--ink-4)">${u.username}</div>
        </div>
      </div>
    </td>
    <td><span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;
      background:rgba(255,255,255,.07);color:${u.role==='admin'?'var(--blue-l)':u.role==='editor'?'var(--violet-l)':'var(--ink-3)'}">
      ${u.role==='admin'?'👑 Admin':u.role==='editor'?'🔑 Editor':'👁 Viewer'}</span></td>
    <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px">
      <span style="width:7px;height:7px;border-radius:50%;background:${u.active?'var(--emerald)':'var(--rose)'}"></span>
      ${u.active?'Aktif':'Pasif'}</span></td>
    <td style="font-size:11px;color:var(--ink-4)">${u.created_at?u.created_at.slice(0,10):'—'}</td>
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-xs" onclick="serverResetPIN('${url}','${u.id}','${u.username}')">🔑 Şifre</button>
        <button class="btn btn-ghost btn-xs" onclick="serverToggleUser('${url}','${u.id}',${u.active})">${u.active?'⏸':'▶'}</button>
      </div>
    </td>
  </tr>`).join('');

  content.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <h3 style="font-size:15px;font-weight:700;flex:1">👥 Sunucu Kullanıcıları</h3>
    <button class="btn btn-ghost btn-sm" onclick="goto('dash')">← Geri</button>
    <button class="btn btn-primary btn-sm" onclick="serverAddUserForm('${url}')">+ Kullanıcı Ekle</button>
  </div>
  <div id="server-user-form"></div>
  <div class="table-card">
    <div class="table-scroller"><table>
      <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Oluşturma</th><th>İşlem</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

async function serverResetPIN(url, userId, username){
  const np = prompt(username+' için yeni şifre (min 6 karakter):','');
  if(!np) return;
  if(np.length<6){ toast('❌ Min 6 karakter','red'); return; }
  try{
    const r = await fetch(url+'/users/'+userId+'/reset-password',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+DATA.cloud.token},
      body:JSON.stringify({newPassword:np})
    });
    const d = await r.json();
    if(d.ok) toast('✅ Şifre güncellendi','green');
    else toast('❌ '+d.error,'red');
  }catch(e){ toast('❌ '+e.message,'red'); }
}

async function serverToggleUser(url, userId, currentActive){
  if(!confirm((currentActive?'Devre dışı bırakılsın':'Aktifleştirilsin')+' mi?')) return;
  try{
    const r = await fetch(url+'/users/'+userId,{
      method:'PUT',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+DATA.cloud.token},
      body:JSON.stringify({active:!currentActive})
    });
    const d = await r.json();
    if(d.ok){ toast(currentActive?'⏸ Pasif yapıldı':'✅ Aktif yapıldı','green'); openServerUserMgmt(); }
    else toast('❌ '+d.error,'red');
  }catch(e){ toast('❌ '+e.message,'red'); }
}

function serverAddUserForm(url){
  const f = document.getElementById('server-user-form');
  f.innerHTML=`<div style="background:var(--glass-light);border:1px solid var(--border-subtle);
    border-radius:var(--r-md);padding:14px;margin-bottom:12px">
    <div style="font-weight:700;margin-bottom:10px">➕ Yeni Sunucu Kullanıcısı</div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Kullanıcı Adı *</label>
        <input class="form-input" id="su_un" placeholder="alper"></div>
      <div class="form-row"><label class="form-label">Ad Soyad *</label>
        <input class="form-input" id="su_n" placeholder="Alper Bey"></div>
    </div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Şifre * (min 6)</label>
        <input class="form-input" id="su_p" type="password" placeholder="••••••"></div>
      <div class="form-row"><label class="form-label">Rol</label>
        <select class="form-select" id="su_r">
          <option value="editor">🔑 Editor</option>
          <option value="viewer">👁 Viewer</option>
          <option value="admin">👑 Admin</option>
        </select></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('server-user-form').innerHTML=''">İptal</button>
      <button class="btn btn-primary btn-sm" onclick="serverSaveNewUser('${url}')">✅ Ekle</button>
    </div>
  </div>`;
}

async function serverSaveNewUser(url){
  const username = document.getElementById('su_un')?.value.trim();
  const name     = document.getElementById('su_n')?.value.trim();
  const password = document.getElementById('su_p')?.value;
  const role     = document.getElementById('su_r')?.value;
  if(!username||!name||!password){ toast('❌ Tüm alanlar zorunlu','red'); return; }
  if(password.length<6){ toast('❌ Şifre min 6 karakter','red'); return; }
  try{
    const r = await fetch(url+'/users',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+DATA.cloud.token},
      body:JSON.stringify({username,name,password,role})
    });
    const d = await r.json();
    if(d.ok){ toast('✅ Kullanıcı eklendi','green'); openServerUserMgmt(); }
    else toast('❌ '+d.error,'red');
  }catch(e){ toast('❌ '+e.message,'red'); }
}


function tplUsers(){
  const roleMeta={
    admin:{label:'👑 Admin',desc:'Tam erişim',color:'#3b82f6'},
    manager:{label:'🔑 Editor',desc:'Ödeme/gider/rapor',color:'#8b5cf6'},
    viewer:{label:'👁 Görüntüleyici',desc:'Sadece okuma',color:'#6b7280'},
  };
  const rows=DATA.users.map((u,i)=>{
    const rm=roleMeta[u.role]||roleMeta.viewer;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${u.color||'#4a8af4'};
            display:flex;align-items:center;justify-content:center;
            font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${u.avatar||u.name[0]||'U'}</div>
          <div>
            <div style="font-weight:600;color:var(--ink-0)">${u.name}</div>
            <div style="font-size:10.5px;color:var(--ink-4)">${u.id}</div>
          </div>
        </div>
      </td>
      <td><span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(255,255,255,.07);color:${rm.color}">${rm.label}</span></td>
      <td style="font-size:11px;color:var(--ink-3)">${rm.desc}</td>
      <td style="font-family:var(--font-mono);color:var(--ink-4);font-size:11px">${'●'.repeat(u.pin?u.pin.length:4)}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px">
          <span style="width:7px;height:7px;border-radius:50%;background:${u.active!==false?'var(--emerald)':'var(--rose)'}"></span>
          <span style="color:var(--ink-3)">${u.active!==false?'Aktif':'Pasif'}</span>
        </span>
      </td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-xs" onclick="editUserInline(${i})">✏️ Düzenle</button>
          <button class="btn btn-ghost btn-xs" onclick="resetUserPIN(${i})">🔑 PIN</button>
          <button class="btn btn-ghost btn-xs" onclick="toggleUserActive(${i})">${u.active!==false?'⏸':'▶'}</button>
          ${isAdmin()&&u.id!==currentUser?.id?`<button class="btn btn-danger btn-xs" onclick="delUserConfirm(${i})">🗑</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="modal-title">👥 Kullanıcı Yönetimi</div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <div style="flex:1;font-size:12px;color:var(--ink-3)">${DATA.users.length} kullanıcı</div>
    ${isAdmin()?'<button class="btn btn-primary btn-sm" onclick="showAddUserForm()">+ Ekle</button>':''}
  </div>
  <div class="table-card" style="margin-bottom:12px">
    <div class="table-scroller"><table>
      <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Yetki</th><th>PIN</th><th>Durum</th><th>İşlem</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
  <div id="user-inline-form"></div>
  <div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);border-radius:var(--r-md);padding:10px 12px;font-size:11.5px;color:var(--ink-3);margin-bottom:8px">
    👑 Admin: tam erişim &nbsp;|&nbsp; 🔑 Editor: veri girişi &nbsp;|&nbsp; 👁 Görüntüleyici: okuma
  </div>
  <div class="modal-footer"><button class="btn btn-ghost" onclick="closeMod()">Kapat</button></div>`;
}

function showAddUserForm(){
  const f=document.getElementById('user-inline-form');
  f.innerHTML=`<div style="background:var(--glass-light);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:14px;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;margin-bottom:10px">➕ Yeni Kullanıcı</div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Ad Soyad *</label><input class="form-input" id="nu_n" placeholder="Ad Soyad"></div>
      <div class="form-row"><label class="form-label">Avatar</label><input class="form-input" id="nu_av" placeholder="A" maxlength="2"></div>
    </div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Rol</label>
        <select class="form-select" id="nu_r">
          <option value="admin">👑 Admin</option>
          <option value="manager" selected>🔑 Editor</option>
          <option value="viewer">👁 Görüntüleyici</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">PIN (4-6 rakam) *</label><input class="form-input" id="nu_p" type="password" maxlength="6" placeholder="••••"></div>
    </div>
    <div class="form-row"><label class="form-label">Renk</label>
      <input type="color" id="nu_c" value="#4a8af4" style="height:36px;width:100%;border-radius:var(--r-sm);border:1px solid var(--border-subtle);cursor:pointer"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('user-inline-form').innerHTML=''">İptal</button>
      <button class="btn btn-primary btn-sm" onclick="saveNewUser()">✅ Ekle</button>
    </div>
  </div>`;
}

function addUserForm(){showAddUserForm();}

function saveNewUser(){
  const name=(document.getElementById('nu_n')?.value||'').trim();
  const avatar=(document.getElementById('nu_av')?.value||name[0]||'U').toUpperCase();
  const role=document.getElementById('nu_r')?.value||'viewer';
  const pin=(document.getElementById('nu_p')?.value||'').trim();
  const color=document.getElementById('nu_c')?.value||'#4a8af4';
  if(!name){toast('❌ İsim zorunlu','red');return;}
  if(pin.length<4){toast('❌ PIN en az 4 haneli','red');return;}
  if(!/^\d+$/.test(pin)){toast('❌ PIN sadece rakam','red');return;}
  DATA.users.push({id:'u_'+Date.now(),name,avatar,role,pin,color,active:true});
  addHist('Kullanıcı eklendi: '+name);
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast('✅ Kullanıcı eklendi','green');
}

function editUserInline(i){
  const u=DATA.users[i];
  const f=document.getElementById('user-inline-form');
  f.innerHTML=`<div style="background:var(--glass-light);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:14px;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;margin-bottom:10px">✏️ Düzenle: ${u.name}</div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Ad Soyad</label><input class="form-input" id="eu_n" value="${u.name}"></div>
      <div class="form-row"><label class="form-label">Avatar</label><input class="form-input" id="eu_av" value="${u.avatar||''}" maxlength="2"></div>
    </div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div class="form-row"><label class="form-label">Rol</label>
        <select class="form-select" id="eu_r">
          <option value="admin" ${u.role==='admin'?'selected':''}>👑 Admin</option>
          <option value="manager" ${u.role==='manager'?'selected':''}>🔑 Editor</option>
          <option value="viewer" ${u.role==='viewer'?'selected':''}>👁 Görüntüleyici</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Renk</label>
        <input type="color" id="eu_c" value="${u.color||'#4a8af4'}" style="height:36px;width:100%;border-radius:var(--r-sm);border:1px solid var(--border-subtle);cursor:pointer"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('user-inline-form').innerHTML=''">İptal</button>
      <button class="btn btn-primary btn-sm" onclick="saveEditUser2(${i})">💾 Kaydet</button>
    </div>
  </div>`;
  f.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function saveEditUser2(i){
  const u=DATA.users[i];
  u.name=document.getElementById('eu_n')?.value.trim()||u.name;
  u.avatar=(document.getElementById('eu_av')?.value||u.name[0]).toUpperCase();
  u.role=document.getElementById('eu_r')?.value||u.role;
  u.color=document.getElementById('eu_c')?.value||u.color;
  addHist('Kullanıcı güncellendi: '+u.name);
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast('✅ Güncellendi','green');
}

function resetUserPIN(i){
  const u=DATA.users[i];
  const np=prompt(u.name+' için yeni PIN (4-6 rakam):','');
  if(!np) return;
  if(np.length<4||!/^\d+$/.test(np)){toast('❌ Geçersiz PIN','red');return;}
  u.pin=np;
  addHist('PIN sıfırlandı: '+u.name);
  saveLocal();
  toast('🔑 PIN güncellendi','green');
  document.getElementById('modal').innerHTML=tplUsers();
}

function toggleUserActive(i){
  const u=DATA.users[i];
  if(u.id===currentUser?.id){toast('⚠️ Kendini devre dışı bırakamazsın','red');return;}
  u.active=!(u.active!==false);
  addHist((u.active?'Aktifleştirildi':'Devre dışı')+': '+u.name);
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast(u.active?'✅ Aktif':'⏸ Pasif',u.active?'green':'red');
}

function delUserConfirm(i){
  const u=DATA.users[i];
  if(u.id===currentUser?.id){toast('⚠️ Kendinizi silemezsiniz','red');return;}
  if(!confirm('"'+u.name+'" silinsin mi? Bu işlem geri alınamaz.')) return;
  DATA.users.splice(i,1);
  addHist('Kullanıcı silindi: '+u.name);
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast('🗑 Silindi','red');
}

function saveUser(){saveNewUser();}
function editUser(i){
  const u=DATA.users[i];
  const roles=['admin','manager','viewer'];
  const rLabels=['👑 Admin','🔑 Manager','👁️ Viewer'];
  const form=`<div style="background:var(--surface3);border-radius:10px;padding:14px;margin-top:10px" id="edit-user-form-${i}">
    <div style="font-weight:700;margin-bottom:10px;font-size:12px">✏️ Düzenle: ${u.name}</div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div><label class="form-label">İsim</label><input class="fi ie" id="eu_n_${i}" value="${u.name}"></div>
      <div><label class="form-label">Avatar Harf</label><input class="fi ie" id="eu_av_${i}" value="${u.avatar}" maxlength="2"></div>
    </div>
    <div class="form-grid-2" style="margin-bottom:10px">
      <div><label class="form-label">Rol</label>
        <select class="form-select" id="eu_r_${i}">
          ${roles.map((r,ri)=>'<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+(rLabels[ri])+'</option>').join('')}
        </select>
      </div>
      <div><label class="form-label">Yeni PIN (boş=değişmez)</label><input class="fi ie" id="eu_p_${i}" type="password" placeholder="min 4 hane"></div>
    </div>
    <div class="form-grid-2" style="margin-bottom:0">
      <div><label class="form-label">Renk</label><input class="form-input" id="eu_c_${i}" type="color" value="${u.color}" style="height:36px;cursor:pointer"></div>
      <div style="display:flex;align-items:flex-end;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="saveEditUser(${i})">💾 Kaydet</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('edit-user-form-${i}').remove()">İptal</button>
      </div>
    </div>
  </div>`;
  const existing=document.getElementById('edit-user-form-'+i);
  if(existing){existing.remove();return;}
  const rows=document.querySelectorAll('#md tbody tr');
  if(rows[i]) rows[i].insertAdjacentHTML('afterend', form);
}
function saveEditUser(i){
  const u=DATA.users[i];
  const nn=document.getElementById('eu_n_'+i)?.value.trim();
  const nav=document.getElementById('eu_av_'+i)?.value.trim();
  const nr=document.getElementById('eu_r_'+i)?.value;
  const np=document.getElementById('eu_p_'+i)?.value.trim();
  const nc=document.getElementById('eu_c_'+i)?.value;
  if(nn) u.name=nn;
  if(nav) u.avatar=nav.toUpperCase();
  if(nr) u.role=nr;
  if(np&&np.length>=4) u.pin=np;
  if(nc) u.color=nc;
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast('✅ Kullanıcı güncellendi','green');
}
function delUser(i){
  if(!confirm('Kullanıcı silinsin mi?')) return;
  DATA.users.splice(i,1);
  saveLocal();
  document.getElementById('modal').innerHTML=tplUsers();
  toast('🗑 Silindi','red');
}

// ═══════════════════════════════════════════════
// ALL PAYMENTS PAGE
// ═══════════════════════════════════════════════
function renderPay(){
  const m=S.month;
  const q=(S.search||'').toLowerCase();
  let rows='';
  BK.forEach(b=>{
    sortU(DATA.tenants[b]||[]).filter(t=>{
      if(!t.active||t.rent===0) return false;
      return !q||t.name.toLowerCase().includes(q)||t.unit.toLowerCase().includes(q);
    }).forEach(t=>{
      const p=getP(t.id,m);
      const st=getStatus(t,m);
      const diff=p.paid-(t.rent||0);
      rows+=`<tr class="cp" onclick="openPanel('${b}','${t.id}')">
        <td><b>${BL[b]}</b></td><td><b>${t.unit}</b></td>
        <td>${isDue(t,m)?'<span class="blink">🔴</span> ':''}${t.name}</td>
        <td class="cb fw7">${TL(t.rent)}</td>
        <td class="${p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red'} fw7">${TL(p.paid)}</td>
        <td class="${diff>0?'c-green':diff<0?'c-red':'c-muted'}">${diff>0?'+':''}${TL(diff)}</td>
        <td><span class="badge ${st.cls}">${st.lbl}</span></td>
        <td class="c-muted">${p.date?p.date.slice(0,10):'—'}</td>
        <td class="c-muted">${p.sekil||'—'}</td>
        <td>${canEdit()?`<button class="btn btn-xs bsu-" onclick="event.stopPropagation();openMod('pay-add','${b}:${t.id}')">+ Ödeme</button>`:''}
        </td>
      </tr>`;
    });
  });
  const tRent=BK.reduce((s,b)=>s+rentTotal(b),0);
  const tPaid=BK.reduce((s,b)=>s+paidTotal(b,m),0);
  return monthBar()+`
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <input type="text" class="form-input" style="width:200px" placeholder="🔍 Kiracı/daire..." oninput="S.search=this.value;render()" value="${S.search}">
    <div style="flex:1"></div>
    ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="openMod('pay-add')">+ Ödeme</button>`:''}
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️</button>
  </div>
  <div class="table-card">
    <div class="table-card-header"><h3>Tüm Ödemeler — ${m}</h3></div>
    <div class="table-scroller"><table>
      <thead><tr><th>Bina</th><th>Daire</th><th>Kiracı</th><th>Kira</th><th>Ödenen</th><th>Fark</th><th>Durum</th><th>Tarih</th><th>Şekil</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="10" class="empty-state-text">Kayıt yok</td></tr>`}
      <tr class="tfoot-row"><td colspan="3">TOPLAM</td><td class="c-blue">${TL(tRent)}</td><td class="${tPaid>=tRent?'c-green':'c-orange'}">${TL(tPaid)}</td><td class="${tPaid-tRent>=0?'c-green':'c-red'}">${TL(tPaid-tRent)}</td><td colspan="4"></td></tr>
      </tbody>
    </table></div>
  </div>`;
}

// ═══════════════════════════════════════════════
// ALL EXPENSES PAGE
// ═══════════════════════════════════════════════
function renderExp(){
  const m=S.month;
  let rows='',grand=0;
  BK.forEach(b=>{
    const exs=((DATA.expenses[b]||{})[m]||[]);
    const sub=exs.reduce((s,e)=>s+(e.tutar||0),0);
    grand+=sub;
    exs.forEach((e,i)=>{
      rows+=`<tr>
        <td><b>${BL[b]}</b></td><td class="mono">${e.no||'—'}</td>
        <td class="fw-600">${e.tur}</td><td class="co fw7">${TL(e.tutar)}</td>
        <td class="c-muted">${e.tarih||'—'}</td><td class="c-muted">${e.notlar||''}</td>
        <td class="nowrap">${canEdit()?`
          <button class="btn btn-xs bg-" onclick="editExp('${b}','${m}',${i})">✏️</button>
          <button class="btn btn-xs bd-" onclick="delExp('${b}','${m}',${i})">🗑</button>`:''}
        </td>
      </tr>`;
    });
    if(sub>0) rows+=`<tr style="background:rgba(74,138,244,.03)"><td colspan="3" class="c-muted">— ${BL[b]} ara toplam</td><td class="c-orange">${TL(sub)}</td><td colspan="3"></td></tr>`;
  });
  const cards=BK.map(b=>{
    const g=expTotal(b,m),p2=paidTotal(b,m),n=p2-g;
    return `<div class="kpi-card" style="--kpi-color:${n>=0?'var(--green)':'var(--red)'}">
      <div class="kpi-icon">🏢</div><div style="font-weight:700;font-size:12px;margin-bottom:6px">${BL[b]}</div>
      <div class="kpi-value">${TL(g)}</div><div class="kpi-label">Gider</div>
      <div style="margin-top:5px;font-size:11.5px" class="${n>=0?'c-green':'c-red'}">Net: ${TL(n)}</div>
    </div>`;
  }).join('');
  return monthBar()+`<div class="kpi-grid">${cards}</div>
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <div style="flex:1"></div>
    ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="openMod('exp-add')">+ Gider</button>`:''}
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️</button>
  </div>
  <div class="table-card">
    <div class="table-card-header"><h3>Tüm Giderler — ${m}</h3></div>
    <div class="table-scroller"><table>
      <thead><tr><th>Bina</th><th>Sayaç/No</th><th>Gider Türü</th><th>Tutar</th><th>Tarih</th><th>Not</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="7" class="empty-state-text">Bu ay gider yok</td></tr>`}
      ${grand?`<tr class="tfoot-row"><td colspan="3">GENEL TOPLAM</td><td class="co fw8">${TL(grand)}</td><td colspan="3"></td></tr>`:''}
      </tbody>
    </table></div>
  </div>`;
}

// ═══════════════════════════════════════════════
// ALPER PAGE
// ═══════════════════════════════════════════════
function renderAlper(){
  const months=Object.keys(DATA.alper);
  const tNet=months.reduce((s,m)=>s+(DATA.alper[m].net||0),0);
  const tCol=months.reduce((s,m)=>s+(DATA.alper[m].col||0),0);
  const tExp=months.reduce((s,m)=>s+(DATA.alper[m].exp||0),0);

  const rows=months.map(m=>{
    const a=DATA.alper[m];
    return `<tr><td class="fw-600">${m}</td>
      <td class="c-blue">${TL(a.col||0)}</td>
      <td class="c-orange">${TL(a.exp||0)}</td>
      <td class="${(a.net||0)>=0?'c-green':'c-red'} fw7">${TL(a.net||0)}</td>
      <td>${canEdit()?`<button class="btn btn-xs bg-" onclick="editAlperMo('${m}')">✏️</button>`:''}
      </td></tr>`;
  }).join('');

  const m=S.month;
  const kTens=sortU((DATA.tenants['KARAKOL']||[]).filter(t=>t.active&&t.rent>0));
  const kRows=kTens.map(t=>{
    const p=getP(t.id,m);const st=getStatus(t,m);
    return `<tr><td><b>${t.unit}</b></td><td>${t.name}</td>
      <td class="c-blue">${TL(t.rent)}</td>
      <td class="${p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red'}">${TL(p.paid)}</td>
      <td><span class="badge ${st.cls}">${st.lbl}</span></td>
      <td class="c-muted">${p.sekil||'—'}</td></tr>`;
  }).join('');

  return monthBar()+`
  <div class="alper-hero">
    <div style="font-size:15px;font-weight:800;color:var(--accent2)">🤝 Alper Hesabı — Karakol</div>
    <div style="font-size:11.5px;color:var(--text2);margin-top:5px;line-height:1.5">
      Alper, Karakol kiracılarından kira tahsil eder ve Alper banka hesabında biriktirir.<br>
      Her ay giderler düşülünce kalan net tutar = Alper'in maliğe olan borcu.
    </div>
    <div class="alper-stats">
      <div class="alper-stat"><div class="alper-sv ${tNet>=0?'c-green':'c-red'}">${TL(tNet)}</div><div class="alper-stat-lbl">Toplam Birikmiş</div></div>
      <div class="alper-stat"><div class="alper-sv cb">${TL(tCol)}</div><div class="alper-stat-lbl">Toplam Tahsilat</div></div>
      <div class="alper-stat"><div class="alper-sv co">${TL(tExp)}</div><div class="alper-stat-lbl">Toplam Gider</div></div>
      <div class="alper-stat"><div class="alper-sv cp2">${months.length}</div><div class="alper-stat-lbl">Ay</div></div>
    </div>
  </div>

  <div class="sec-hdr">📅 Aylık Borç Tablosu ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="addAlperMo()">+ Ay</button>`:''}</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Ay</th><th>Tahsilat</th><th>Gider</th><th>Net Borç</th><th></th></tr></thead>
    <tbody>${rows}
    <tr class="tfoot-row"><td>TOPLAM</td><td class="c-blue">${TL(tCol)}</td><td class="c-orange">${TL(tExp)}</td><td class="${tNet>=0?'c-green':'c-red'} fw8">${TL(tNet)}</td><td></td></tr>
    </tbody>
  </table></div></div>

  <div class="sec-hdr">🏠 Karakol — ${m}</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Daire</th><th>Kiracı</th><th>Kira</th><th>Ödenen</th><th>Durum</th><th>Şekil</th></tr></thead>
    <tbody>${kRows}</tbody>
  </table></div></div>

  <div class="sec-hdr">📊 Tan Sokak Net</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Ay</th><th>Tahsilat</th><th>Gider</th><th>Net (TL)</th><th>Kur</th><th>Net (€)</th></tr></thead>
    <tbody>${Object.keys(DATA.tanNet).map(mo=>{
      const d=DATA.tanNet[mo];
      return `<tr><td class="fw-600">${mo}</td><td class="c-blue">${TL(d.col)}</td><td class="c-orange">${TL(d.exp)}</td><td class="${d.net>=0?'c-green':'c-red'} fw7">${TL(d.net)}</td><td class="c-muted">${d.kur||0}</td><td class="cp2 fw7">€${(d.eur||0).toFixed(2)}</td></tr>`;
    }).join('')}</tbody>
  </table></div></div>
  `;
}

function editAlperMo(mo){
  const a=DATA.alper[mo]||{};
  const c=prompt(`${mo} — Tahsilat:`,a.col||0);if(c===null)return;
  const g=prompt(`${mo} — Gider:`,a.exp||0);if(g===null)return;
  const col=parseFloat(c)||0,exp=parseFloat(g)||0;
  DATA.alper[mo]={col,exp,net:col-exp};
  addHist(`Alper ${mo} güncellendi`);render();
}
function addAlperMo(){
  const ay=prompt('Ay (örn: Haziran 2026):');if(!ay)return;
  const c=parseFloat(prompt('Tahsilat:','0')||0);
  const g=parseFloat(prompt('Gider:','0')||0);
  DATA.alper[ay]={col:c,exp:g,net:c-g};
  addHist(`Alper ${ay} eklendi`);render();
}

// ═══════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════
function renderCharts(){
  return `
  <div class="kpi-grid">
    <div class="kpi-card" style="--kpi-color:var(--accent)"><div class="kpi-icon">📊</div><div class="kpi-value">4</div><div class="kpi-label">Grafik</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="chart-card"><div class="chart-title">📈 Alper Aylık Net</div><canvas id="ch-alper" height="200"></canvas></div>
    <div class="chart-card"><div class="chart-title">🏢 Bina Tahsilat — ${S.month}</div><canvas id="ch-bina" height="200"></canvas></div>
    <div class="chart-card"><div class="chart-title">📉 Tan Sokak Net Gelir</div><canvas id="ch-tan" height="200"></canvas></div>
    <div class="chart-card"><div class="chart-title">💳 Ödeme Durumu — ${S.month}</div><canvas id="ch-durum" height="200"></canvas></div>
  </div>`;
}

let chartInstances={};
function destroyCharts(){Object.values(chartInstances).forEach(c=>{try{c.destroy();}catch(e){}});chartInstances={};}

function initCharts(){
  destroyCharts();
  const theme={grid:'rgba(26,48,84,.4)',text:'#7d9ec8'};
  const co={responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:theme.text,font:{size:11}}}}};

  // Alper bar + line
  const alperMos=Object.keys(DATA.alper);
  const alperVals=alperMos.map(m=>DATA.alper[m].net||0);
  const alperCol=alperMos.map(m=>DATA.alper[m].col||0);
  const c1=document.getElementById('ch-alper');
  if(c1) chartInstances.alper=new Chart(c1,{
    type:'bar',
    data:{
      labels:alperMos.map(m=>m.replace(' ','<br>')),
      datasets:[
        {label:'Net Borç',data:alperVals,backgroundColor:alperVals.map(v=>v>=0?'rgba(30,214,120,.6)':'rgba(240,84,84,.6)'),borderRadius:4},
        {label:'Tahsilat',data:alperCol,type:'line',borderColor:'rgba(74,138,244,.8)',backgroundColor:'rgba(74,138,244,.1)',pointRadius:3,tension:.3,fill:true,yAxisID:'y2'},
      ]
    },
    options:{...co,scales:{
      x:{ticks:{color:theme.text,font:{size:9},maxRotation:45},grid:{color:theme.grid}},
      y:{ticks:{color:theme.text,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.grid}},
      y2:{position:'right',ticks:{color:'rgba(74,138,244,.7)',callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{display:false}},
    }}
  });

  // Bina bar
  const m=S.month;
  const c2=document.getElementById('ch-bina');
  if(c2) chartInstances.bina=new Chart(c2,{
    type:'bar',
    data:{
      labels:BK.map(b=>BL[b]),
      datasets:[
        {label:'Kira',data:BK.map(b=>rentTotal(b)),backgroundColor:'rgba(74,138,244,.5)',borderRadius:4},
        {label:'Tahsilat',data:BK.map(b=>paidTotal(b,m)),backgroundColor:'rgba(30,214,120,.6)',borderRadius:4},
        {label:'Gider',data:BK.map(b=>expTotal(b,m)),backgroundColor:'rgba(245,166,35,.6)',borderRadius:4},
      ]
    },
    options:{...co,scales:{
      x:{ticks:{color:theme.text},grid:{color:theme.grid}},
      y:{ticks:{color:theme.text,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.grid}},
    }}
  });

  // Tan sokak line
  const tanMos=Object.keys(DATA.tanNet);
  const c3=document.getElementById('ch-tan');
  if(c3) chartInstances.tan=new Chart(c3,{
    type:'line',
    data:{
      labels:tanMos,
      datasets:[
        {label:'Net (TL)',data:tanMos.map(m=>(DATA.tanNet[m].net||0)),borderColor:'rgba(6,214,160,.8)',backgroundColor:'rgba(6,214,160,.1)',pointRadius:4,tension:.3,fill:true},
        {label:'Tahsilat',data:tanMos.map(m=>(DATA.tanNet[m].col||0)),borderColor:'rgba(74,138,244,.6)',backgroundColor:'transparent',pointRadius:3,tension:.3},
      ]
    },
    options:{...co,scales:{
      x:{ticks:{color:theme.text},grid:{color:theme.grid}},
      y:{ticks:{color:theme.text,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.grid}},
    }}
  });

  // Payment status donut
  let paid=0,partial=0,unpaid=0;
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0).forEach(t=>{
    const p=getP(t.id,m);
    if(p.paid>=t.rent) paid++;
    else if(p.paid>0) partial++;
    else unpaid++;
  }));
  const c4=document.getElementById('ch-durum');
  if(c4) chartInstances.durum=new Chart(c4,{
    type:'doughnut',
    data:{
      labels:['Ödendi','Kısmi','Ödenmedi'],
      datasets:[{data:[paid,partial,unpaid],backgroundColor:['rgba(30,214,120,.7)','rgba(245,166,35,.7)','rgba(240,84,84,.7)'],borderWidth:0}]
    },
    options:{...co,cutout:'60%',plugins:{legend:{position:'bottom',labels:{color:theme.text}}}}
  });
}

// ═══════════════════════════════════════════════
// WHATSAPP PAGE
// ═══════════════════════════════════════════════
function renderWA(){
  const m=S.month;
  const unpaid=[];
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>{
    if(!t.active||t.rent===0) return false;
    return isDue(t,m)||getP(t.id,m).paid<t.rent;
  }).forEach(t=>unpaid.push({b,t})));

  const rows=unpaid.map(({b,t})=>{
    const p=getP(t.id,m);
    const st=getStatus(t,m);
    const msg=buildWAMsg(b,t,m);
    const phone=(t.phone||'').replace(/\D/g,'');
    return `<div class="wa-reminder-card">
      <div class="wa-reminder-hdr">
        <div style="flex:1">
          <div class="fw-600">${BL[b]} — ${t.unit} <b>${t.name}</b></div>
          <div style="font-size:10.5px;color:var(--text3)">${t.phone?'📱 '+t.phone:'⚠️ Telefon yok'} · Kira: ${TL(t.rent)} · Ödenen: ${TL(p.paid)}</div>
        </div>
        <span class="badge ${st.cls}">${st.lbl}</span>
      </div>
      <div class="wa-msg-box">${msg}</div>
      <div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap">
        ${phone?`<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-success btn-sm">💬 WhatsApp Gönder</a>`:'<span class="c-muted" style="font-size:11px">📵 Telefon kaydedilmemiş</span>'}
        <button class="btn btn-ghost btn-sm" onclick="logWA('${b}','${t.id}','${m}')">📝 Gönderildi Kaydet</button>
      </div>
    </div>`;
  }).join('');

  const logRows=DATA.waLog.slice(-30).reverse().map(l=>`
    <div class="wa-log-item">
      <span class="c-muted">${l.t}</span>
      <span style="flex:1">${l.bina} ${l.unit} – ${l.name}</span>
      <span class="c-muted">${l.mo}</span>
    </div>`).join('');

  return monthBar()+`
  <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
    <div style="font-size:13px;font-weight:700;flex:1">💬 WhatsApp Hatırlatıcı — ${m}</div>
    ${unpaid.length&&canEdit()?`<button class="btn btn-primary btn-sm" onclick="sendAllWA('${m}')">📤 Hepsine Gönder (${unpaid.length})</button>`:''}
  </div>

  <div style="background:rgba(37,211,102,.06);border:1px solid rgba(37,211,102,.15);border-radius:10px;padding:12px;margin-bottom:14px;font-size:11.5px;color:var(--text2)">
    <b style="color:var(--text)">Otomatik hatırlatıcı:</b> server.js çalıştığında, kira günü geçtikten sonra otomatik WhatsApp gönderir.<br>
    <b>Manuel:</b> Aşağıdaki butonlardan tek tek veya toplu gönderebilirsiniz.
  </div>

  ${rows||`<div style="text-align:center;padding:32px;color:var(--text3)">✅ ${m} için gecikmiş ödeme yok!</div>`}

  ${DATA.waLog.length?`
  <div class="sec-hdr">📋 Gönderim Geçmişi (son 30)</div>
  <div class="wa-reminder-card"><div class="wa-log">${logRows}</div></div>`:''}
  `;
}

function buildWAMsg(bname,t,mo){
  return `Merhaba ${t.name} Bey/Hanım, ${BL[bname]} ${t.unit} için ${mo} kira ödemeniz (${TL(t.rent)}) henüz görünmüyor. Rica etsek kontrol edip bilgi verebilir misiniz? Teşekkürler.`;
}

function waMsg(bname,tid,mo){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  const msg=buildWAMsg(bname,t,mo);
  const phone=(t.phone||'').replace(/\D/g,'');
  const url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
  logWA(bname,tid,mo);
}

function logWA(bname,tid,mo){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  if(!DATA.waLog) DATA.waLog=[];
  DATA.waLog.push({t:new Date().toLocaleString('tr-TR'),bina:BL[bname],unit:t.unit,name:t.name,mo});
  addHist(`WA gönderildi: ${BL[bname]} ${t.unit} – ${t.name} (${mo})`);
  saveLocal();toast('📝 Kayıt edildi','blue');
}

function sendAllWA(mo){
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>{
    if(!t.active||t.rent===0) return false;
    return isDue(t,mo)||getP(t.id,mo).paid<t.rent;
  }).forEach((t,i)=>{
    setTimeout(()=>{
      const phone=(t.phone||'').replace(/\D/g,'');
      if(phone){
        const msg=buildWAMsg(b,t,mo);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank');
        logWA(b,t.id,mo);
      }
    },i*800);
  }));
}

// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════
function renderRep(){
  const m=S.month;
  const secs=BK.map(b=>{
    const ts=sortU((DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0));
    const exs=((DATA.expenses[b]||{})[m]||[]);
    const paid=paidTotal(b,m),ex=expTotal(b,m),net=paid-ex;
    return `
    <div class="sec-hdr">🏢 ${BL[b]}</div>
    <div class="kpi-grid" style="margin-bottom:10px">
      <div class="kpi-card" style="--kpi-color:var(--accent)"><div class="kpi-icon">💰</div><div class="kpi-value">${TL(ts.reduce((s,t)=>s+t.rent,0))}</div><div class="kpi-label">Toplam Kira</div></div>
      <div class="kpi-card" style="--kpi-color:var(--green)"><div class="kpi-icon">✅</div><div class="kpi-value">${TL(paid)}</div><div class="kpi-label">Tahsil</div></div>
      <div class="kpi-card" style="--kpi-color:var(--orange)"><div class="kpi-icon">💸</div><div class="kpi-value">${TL(ex)}</div><div class="kpi-label">Gider</div></div>
      <div class="kpi-card" style="--kpi-color:${net>=0?'var(--green)':'var(--red)'}"><div class="kpi-icon">📈</div><div class="kpi-value">${TL(net)}</div><div class="kpi-label">Net</div></div>
    </div>
    <div class="table-card" style="margin-bottom:14px"><div class="table-scroller"><table>
      <thead><tr><th>Daire</th><th>Kiracı</th><th>Kira</th><th>Ödenen</th><th>Durum</th><th>Tarih</th></tr></thead>
      <tbody>${ts.map(t=>{const p=getP(t.id,m);const st=getStatus(t,m);
        return `<tr><td>${t.unit}</td><td>${t.name}</td><td class="c-blue">${TL(t.rent)}</td>
          <td class="${p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red'}">${TL(p.paid)}</td>
          <td><span class="badge ${st.cls}">${st.lbl}</span></td>
          <td class="c-muted">${p.date?p.date.slice(0,10):'—'}</td></tr>`;}).join('')}
      </tbody>
    </table></div></div>
    <div class="table-card" style="margin-bottom:20px"><div class="table-scroller"><table>
      <thead><tr><th>Sayaç/No</th><th>Gider</th><th>Tutar</th><th>Tarih</th></tr></thead>
      <tbody>${exs.map(e=>`<tr><td class="mono">${e.no||'—'}</td><td>${e.tur}</td><td class="c-orange">${TL(e.tutar)}</td><td class="c-muted">${e.tarih||'—'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty-state-text">Gider yok</td></tr>'}
      ${exs.length?`<tr class="tfoot-row"><td colspan="2">TOPLAM GİDER</td><td class="c-orange">${TL(ex)}</td><td></td></tr>`:''}
      </tbody>
    </table></div></div>`;
  }).join('');
  return monthBar()+`
  <div style="display:flex;align-items:center;margin-bottom:14px">
    <h3 style="font-size:14px;flex:1">📄 Rapor — ${m}</h3>
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️</button>
    <button class="btn btn-secondary btn-sm" style="margin-left:6px" onclick="exportCSV()">📤 CSV</button>
  </div>
  ${secs}`;
}

// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════
function renderHist(){
  return `
  <div class="sec-hdr">🕐 Değişiklik Geçmişi (${DATA.history.length})</div>
  <div class="table-card"><div class="table-scroller"><table>
    <thead><tr><th>Zaman</th><th>Kullanıcı</th><th>Açıklama</th></tr></thead>
    <tbody>${DATA.history.length?DATA.history.map(h=>`<tr>
      <td class="cm nowrap" style="font-size:10.5px">${h.t}</td>
      <td class="c-muted">${h.user||'—'}</td>
      <td>${h.desc}</td>
    </tr>`).join(''):'<tr><td colspan="3" class="empty-state-text">Kayıt yok</td></tr>'}
    </tbody>
  </table></div></div>`;
}

// ═══════════════════════════════════════════════
// INLINE CELL EDIT
// ═══════════════════════════════════════════════
function makeEditable(el, onSave){
  if(!canEdit()) return;
  el.contentEditable='true';
  el.classList.add('editable');
  el.addEventListener('blur',()=>{
    el.contentEditable='false';
    el.classList.remove('editable');
    onSave(el.textContent.trim());
    autoRecalc();
    saveLocal();
    if(DATA.cloud.enabled) cloudSync('push');
  },{once:true});
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();el.blur();}
    if(e.key==='Escape'){el.contentEditable='false';el.classList.remove('editable');}
  },{once:true});
  el.focus();
  const range=document.createRange();range.selectNodeContents(el);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
}

// ═══════════════════════════════════════════════
// AUTO-RECALCULATE ACCOUNTING
// ═══════════════════════════════════════════════
function autoRecalc(){
  // Recalc alper rows from actual data
  Object.keys(DATA.alper).forEach(mo=>{
    const a=DATA.alper[mo];
    if(a.col!==undefined && a.exp!==undefined){
      a.net = (a.col||0) - (a.exp||0);
    }
  });
  // Recalc tanNet from expenses
  Object.keys(DATA.tanNet).forEach(mo=>{
    const d=DATA.tanNet[mo];
    const actualExp = expTotal('TAN SOKAK', mo);
    const actualPaid = paidTotal('TAN SOKAK', mo);
    if(actualExp>0) d.exp=actualExp;
    if(actualPaid>0) d.col=actualPaid;
    d.net = (d.col||0) - (d.exp||0);
    d.eur = (d.kur&&d.kur>0) ? d.net/d.kur : 0;
  });
  // Recalc gayNet
  Object.keys(DATA.gayNet).forEach(mo=>{
    const d=DATA.gayNet[mo];
    const actualExp = expTotal('GAYRETTEPE', mo);
    const actualPaid = paidTotal('GAYRETTEPE', mo);
    if(actualExp>0) d.exp=actualExp;
    if(actualPaid>0) d.col=actualPaid;
    d.net = (d.col||0) - (d.exp||0);
    d.eur = (d.kur&&d.kur>0) ? d.net/d.kur : 0;
  });
}

// ═══════════════════════════════════════════════
// 3D VISUALIZATION PAGE
// ═══════════════════════════════════════════════
function renderViz(){
  return `
  <div class="viz-toolbar">
    <div class="srch-wrap">
      <input type="text" class="viz-search srch" id="viz-srch" placeholder="🔍 Bina, daire, kiracı..." oninput="filterViz(this.value)">
    </div>
    <button class="btn btn-secondary btn-sm" onclick="resetVizCamera()">↩ Sıfırla</button>
    <button class="btn btn-secondary btn-sm" onclick="toggleVizAnim()">⏯ Animasyon</button>
    <select class="form-select" id="viz-mode" onchange="setVizMode(this.value)" style="width:140px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--rs);padding:6px 10px;font-size:12px;">
      <option value="all">Tüm Veriler</option>
      <option value="payments">Ödemeler</option>
      <option value="expenses">Giderler</option>
      <option value="net">Net Gelir</option>
    </select>
    <div class="viz-legend">
      <span><span class="viz-legend-dot" style="background:#4a8af4"></span>Gayrettepe</span>
      <span><span class="viz-legend-dot" style="background:#7b6cf6"></span>Karakol</span>
      <span><span class="viz-legend-dot" style="background:#06d6a0"></span>Tan Sokak</span>
      <span><span class="viz-legend-dot" style="background:#1ed678"></span>Ödendi</span>
      <span><span class="viz-legend-dot" style="background:#f05454"></span>Ödenmedi</span>
    </div>
  </div>
  <div id="viz-wrap">
    <canvas id="viz-canvas" style="width:100%;height:100%;display:block;cursor:grab"></canvas>
    <div class="viz-tooltip" id="viz-tip"></div>
    <div style="position:absolute;bottom:12px;left:12px;font-size:10.5px;color:var(--text3)">
      Döndür: Sürükle · Zoom: Scroll · Seç: Tıkla
    </div>
  </div>`;
}

let vizState={
  angle:0, tilt:0.4, zoom:1, dragging:false, lastX:0, lastY:0,
  animating:true, filter:'', mode:'all', hoveredBar:null, animFrame:null
};

function initViz(){
  const canvas=document.getElementById('viz-canvas');
  if(!canvas) return;
  const wrap=document.getElementById('viz-wrap');
  canvas.width=wrap.clientWidth;
  canvas.height=wrap.clientHeight;
  
  canvas.onmousedown=e=>{vizState.dragging=true;vizState.lastX=e.clientX;vizState.lastY=e.clientY;canvas.style.cursor='grabbing';};
  canvas.onmouseup=e=>{
    if(Math.abs(e.clientX-vizState.lastX)<3&&Math.abs(e.clientY-vizState.lastY)<3) handleVizClick(e);
    vizState.dragging=false;canvas.style.cursor='grab';
  };
  canvas.onmousemove=e=>{
    if(vizState.dragging){
      vizState.angle+=(e.clientX-vizState.lastX)*0.008;
      vizState.tilt=Math.max(0.1,Math.min(1.2,vizState.tilt+(e.clientY-vizState.lastY)*0.005));
      vizState.lastX=e.clientX;vizState.lastY=e.clientY;
    }
    handleVizHover(e,canvas);
  };
  canvas.onwheel=e=>{e.preventDefault();vizState.zoom=Math.max(0.4,Math.min(2.5,vizState.zoom-e.deltaY*0.001));};
  canvas.onmouseleave=()=>{document.getElementById('viz-tip').style.display='none';};
  
  if(vizState.animFrame) cancelAnimationFrame(vizState.animFrame);
  vizLoop(canvas);
}

function buildVizData(filter,mode){
  const m=S.month;
  const bars=[];
  const bNames=['GAYRETTEPE','KARAKOL','TAN SOKAK'];
  const bColors=['#4a8af4','#7b6cf6','#06d6a0'];
  const q=(filter||'').toLowerCase();
  
  bNames.forEach((b,bi)=>{
    const tenants=(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0&&(!q||t.name.toLowerCase().includes(q)||t.unit.toLowerCase().includes(q)||(BL[b]).toLowerCase().includes(q)));
    const exp=expTotal(b,m);
    const paid=paidTotal(b,m);
    const rent=rentTotal(b);
    
    // Building summary bar
    let val=0;
    if(mode==='payments') val=paid;
    else if(mode==='expenses') val=exp;
    else if(mode==='net') val=paid-exp;
    else val=rent;
    
    bars.push({label:BL[b],val,type:'building',color:bColors[bi],bld:b,paid,rent,exp,net:paid-exp,tenants:tenants.length});
    
    // Per-tenant bars if not too many and filter active
    if(q||tenants.length<=12){
      tenants.forEach(t=>{
        const p=getP(t.id,m);
        let tv=0;
        if(mode==='payments') tv=p.paid;
        else if(mode==='expenses') tv=0;
        else if(mode==='net') tv=p.paid-t.rent;
        else tv=t.rent;
        bars.push({label:t.unit+' '+t.name.split(' ')[0],val:tv,type:'tenant',color:p.paid>=t.rent?'#1ed678':'#f05454',bld:b,bIdx:bi,paid:p.paid,rent:t.rent,name:t.name,unit:t.unit});
      });
    }
  });
  return bars;
}

let vizBars=[];
function vizLoop(canvas){
  const ctx=canvas.getContext('2d');
  const draw=()=>{
    if(!document.getElementById('viz-canvas')){return;}
    canvas.width=canvas.parentElement.clientWidth;
    canvas.height=canvas.parentElement.clientHeight;
    const W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    
    // BG gradient
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#07101f');bg.addColorStop(1,'#0d1829');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    
    // Grid lines
    ctx.strokeStyle='rgba(26,48,84,.4)';ctx.lineWidth=1;
    for(let i=0;i<=5;i++){
      const y=H*0.8-(H*0.6)*(i/5);
      ctx.beginPath();ctx.moveTo(W*0.05,y);ctx.lineTo(W*0.95,y);ctx.stroke();
      ctx.fillStyle='rgba(125,158,200,.4)';ctx.font='10px Segoe UI';ctx.textAlign='right';
    }
    
    const data=buildVizData(vizState.filter,vizState.mode);
    vizBars=[];
    if(!data.length){ctx.fillStyle='rgba(125,158,200,.5)';ctx.font='14px Segoe UI';ctx.textAlign='center';ctx.fillText('Sonuç yok',W/2,H/2);return;}
    
    const maxVal=Math.max(1,...data.map(d=>Math.abs(d.val)));
    const n=data.length;
    const bw=Math.min(60,Math.max(18,(W*0.88)/n-4));
    const startX=W*0.06;
    const baseY=H*0.78;
    const maxH=H*0.52;
    
    data.forEach((d,i)=>{
      const x=startX+i*(bw+4);
      const barH=Math.max(2,Math.abs(d.val)/maxVal*maxH);
      const y=d.val>=0?baseY-barH:baseY;
      const isHov=(vizState.hoveredBar===i);
      
      // 3D effect (right face)
      const depth=isHov?12:8;
      const col=d.color;
      // Darken color for side face
      ctx.fillStyle=col+'99';
      ctx.beginPath();
      ctx.moveTo(x+bw,y);ctx.lineTo(x+bw+depth,y-depth);
      ctx.lineTo(x+bw+depth,baseY-depth+(d.val<0?barH:0));
      ctx.lineTo(x+bw,baseY+(d.val<0?barH:0));
      ctx.closePath();ctx.fill();
      // Top face
      ctx.fillStyle=col+'cc';
      ctx.beginPath();
      ctx.moveTo(x,y);ctx.lineTo(x+depth,y-depth);
      ctx.lineTo(x+bw+depth,y-depth);ctx.lineTo(x+bw,y);
      ctx.closePath();ctx.fill();
      // Front face
      const grad=ctx.createLinearGradient(x,y,x+bw,y+barH);
      grad.addColorStop(0,col+(isHov?'ff':'cc'));
      grad.addColorStop(1,col+'88');
      ctx.fillStyle=grad;
      ctx.fillRect(x,y,bw,barH);
      // Glow on hover
      if(isHov){ctx.shadowColor=col;ctx.shadowBlur=15;ctx.fillRect(x,y,bw,barH);ctx.shadowBlur=0;}
      
      // Store hitbox
      vizBars.push({x,y,w:bw,h:barH,d,i});
      
      // Label
      ctx.fillStyle=isHov?'#fff':'rgba(125,158,200,.8)';
      ctx.font=`${bw>30?10:8}px Segoe UI`;ctx.textAlign='center';
      const shortLabel=d.label.length>8?d.label.slice(0,7)+'…':d.label;
      if(bw>20) ctx.fillText(shortLabel,x+bw/2,baseY+14);
      
      // Value on top
      if(isHov||bw>35){
        ctx.fillStyle='#fff';ctx.font='bold 10px Segoe UI';
        const vStr=Math.abs(d.val)>=1000?'₺'+(d.val/1000).toFixed(0)+'K':'₺'+d.val.toFixed(0);
        ctx.fillText(vStr,x+bw/2,y-depth-4);
      }
    });
    
    // Baseline
    ctx.strokeStyle='rgba(74,138,244,.3)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(W*0.04,baseY);ctx.lineTo(W*0.96,baseY);ctx.stroke();
    
    // Axis label
    ctx.fillStyle='rgba(125,158,200,.5)';ctx.font='10px Segoe UI';ctx.textAlign='left';
    ctx.fillText('₺0',W*0.02,baseY+4);
    const maxLbl=maxVal>=1e6?'₺'+(maxVal/1e6).toFixed(1)+'M':maxVal>=1000?'₺'+(maxVal/1000).toFixed(0)+'K':'₺'+maxVal.toFixed(0);
    ctx.fillText(maxLbl,W*0.02,H*0.78-maxH-2);
    
    if(vizState.animating){vizState.angle+=0.003;}
    vizState.animFrame=requestAnimationFrame(draw);
  };
  draw();
}

function handleVizHover(e,canvas){
  const rect=canvas.getBoundingClientRect();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let found=-1;
  vizBars.forEach((b,i)=>{if(mx>=b.x&&mx<=b.x+b.w&&my>=b.y&&my<=b.y+b.h)found=i;});
  vizState.hoveredBar=found;
  const tip=document.getElementById('viz-tip');
  if(found>=0){
    const d=vizBars[found].d;
    tip.style.display='block';
    tip.style.left=(e.clientX-canvas.getBoundingClientRect().left+10)+'px';
    tip.style.top=(e.clientY-canvas.getBoundingClientRect().top-20)+'px';
    tip.innerHTML=`<div style="font-weight:700;margin-bottom:4px">${d.label}</div>
      ${d.type==='building'?`
        <div>Kira: <b class="c-blue">${TL(d.rent||0)}</b></div>
        <div>Tahsilat: <b class="c-green">${TL(d.paid||0)}</b></div>
        <div>Gider: <b class="c-orange">${TL(d.exp||0)}</b></div>
        <div>Net: <b class="${(d.net||0)>=0?'c-green':'c-red'}">${TL(d.net||0)}</b></div>
        <div>Kiracı: ${d.tenants}</div>`:`
        <div>${BL[d.bld]}</div>
        <div>Kira: <b class="c-blue">${TL(d.rent||0)}</b></div>
        <div>Ödenen: <b class="${d.paid>=d.rent?'c-green':'c-red'}">${TL(d.paid||0)}</b></div>
        <div>Fark: <b class="${d.paid-d.rent>=0?'c-green':'c-red'}">${TL(d.paid-d.rent)}</b></div>`}`;
  } else {tip.style.display='none';}
}

function handleVizClick(e){
  if(vizState.hoveredBar===null||vizState.hoveredBar<0) return;
  const bar=vizBars[vizState.hoveredBar];
  if(!bar) return;
  const d=bar.d;
  if(d.type==='building') goto('bld',d.bld);
}

function filterViz(v){vizState.filter=v;}
function resetVizCamera(){vizState.angle=0;vizState.tilt=0.4;vizState.zoom=1;}
function toggleVizAnim(){vizState.animating=!vizState.animating;}
function setVizMode(v){vizState.mode=v;}

// ═══════════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════════
function globalSearch(q){
  S.search=q;
  if(S.page==='bld'||S.page==='pay') render();
  else if(q.length>1){
    for(const b of BK){
      if((DATA.tenants[b]||[]).find(t=>t.name.toLowerCase().includes(q.toLowerCase())||t.unit.toLowerCase().includes(q.toLowerCase()))){
        goto('bld',b);return;
      }
    }
  }
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════
function exportCSV(){
  const m=S.month;
  let csv='\uFEFFBina,Daire,Kat,Kiracı,Kira,Ödenen,Fark,Durum,Tarih,Şekil,Kontrat Baş,Kontrat Bit\n';
  BK.forEach(b=>{
    sortU(DATA.tenants[b]||[]).forEach(t=>{
      const p=getP(t.id,m);const st=getStatus(t,m);
      csv+=`${BL[b]},${t.unit},${t.fl||''},${t.name},${t.rent},${p.paid},${p.paid-t.rent},${st.lbl},${p.date||''},${p.sekil||''},${t.bas||''},${t.bit||''}\n`;
    });
  });
  csv+='\n\nBina,No,Tür,Tutar,Tarih\n';
  BK.forEach(b=>{((DATA.expenses[b]||{})[m]||[]).forEach(e=>{csv+=`${BL[b]},${e.no||''},${e.tur},${e.tutar},${e.tarih||''}\n`;});});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`KiraTakip_${m.replace(' ','_')}.csv`;a.click();
  toast('📤 CSV indirildi','blue');
}

function exportJSON(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'}));
  a.download=`KiraTakip_Yedek_${new Date().toISOString().slice(0,10)}.json`;
  a.click();toast('💾 JSON yedek indirildi','blue');
}

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
function toast(msg,type='green'){
  const el=document.getElementById('toast');
  if(!el) return;
  const cfg={
    green:  {color:'var(--emerald-l)',bg:'var(--ok-bg)',  bd:'var(--ok-bd)'},
    blue:   {color:'var(--blue-l)',   bg:'var(--info-bg)',bd:'var(--info-bd)'},
    red:    {color:'var(--rose-l)',   bg:'var(--err-bg)', bd:'var(--err-bd)'},
    orange: {color:'var(--amber-l)',  bg:'var(--warn-bg)',bd:'var(--warn-bd)'},
    violet: {color:'var(--violet-l)', bg:'rgba(139,92,246,.09)',bd:'rgba(139,92,246,.2)'},
  };
  const c=cfg[type]||cfg.green;
  el.style.color=c.color;
  el.style.background=c.bg;
  el.style.borderColor=c.bd;
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),3000);
}


// ═══════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════
let cmdSelectedIdx = -1;
let cmdItems = [];

function openCMD(){
  document.getElementById('cmd-overlay').classList.add('open');
  const inp = document.getElementById('cmd-input');
  inp.value = '';
  cmdSearch('');
  setTimeout(()=>inp.focus(), 50);
}
function closeCMD(e){
  if(!e || e.target===document.getElementById('cmd-overlay'))
    document.getElementById('cmd-overlay').classList.remove('open');
}
function closeKbd(){document.getElementById('cmd-overlay').classList.remove('open');}

function cmdSearch(q){
  const Q = (q||'').toLowerCase().trim();
  const results = document.getElementById('cmd-results');
  cmdItems = [];
  cmdSelectedIdx = -1;
  let html = '';

  // ── Actions ──
  const actions = [
    {icon:'💳',title:'Ödeme Ekle',sub:'Yeni ödeme kaydı',action:()=>{openModal('pay-add');closeKbd();}},
    {icon:'💸',title:'Gider Ekle',sub:'Yeni gider kaydı',action:()=>{openModal('exp-add');closeKbd();}},
    {icon:'👤',title:'Kiracı Ekle',sub:'Yeni kiracı ekle',action:()=>{openModal('ten-add','');closeKbd();}},
    {icon:'📊',title:'Dashboard',sub:'Ana sayfaya git',action:()=>{goto('dash');closeKbd();}},
    {icon:'💬',title:'WhatsApp Hatırlatıcı',sub:'Gecikmiş ödemeler',action:()=>{goto('wa');closeKbd();}},
    {icon:'📈',title:'Grafikler',sub:'Finansal grafikler',action:()=>{goto('charts');closeKbd();}},
    {icon:'📄',title:'Raporlar',sub:'Aylık raporlar',action:()=>{goto('rep');closeKbd();}},
    {icon:'🌐',title:'3D Görünüm',sub:'3D veri görselleştirme',action:()=>{goto('viz');closeKbd();}},
    {icon:'☁️',title:'Bulut Sync',sub:'Senkronize et',action:()=>{openModal('cloud');closeKbd();}},
    {icon:'💾',title:'Kaydet',sub:'Verileri kaydet',action:()=>{manualSave();closeKbd();}},
    {icon:'📤',title:'CSV İndir',sub:'Tablo verisi',action:()=>{exportCSV();closeKbd();}},
    {icon:'📥',title:'JSON Yedek',sub:'Tam yedek indir',action:()=>{exportJSON();closeKbd();}},
    {icon:'🖨️',title:'Yazdır',sub:'Sayfa yazdır',action:()=>{window.print();closeKbd();}},
  ];
  const filteredActions = Q ? actions.filter(a=>a.title.toLowerCase().includes(Q)||a.sub.toLowerCase().includes(Q)) : actions.slice(0,6);
  if(filteredActions.length){
    html += '<div class="cmd-group-label">İşlemler</div>';
    filteredActions.forEach(a=>{
      const idx = cmdItems.length;
      cmdItems.push(a);
      html += `<div class="cmd-item" data-idx="${idx}" onclick="cmdRun(${idx})">
        <div class="cmd-item-icon">${a.icon}</div>
        <div class="cmd-item-label">
          <div class="cmd-item-title">${a.title}</div>
          <div class="cmd-item-sub">${a.sub}</div>
        </div>
      </div>`;
    });
  }

  // ── Tenants ──
  if(Q.length>=1){
    const tenantHits=[];
    BK.forEach(b=>{
      (DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0).forEach(t=>{
        if(t.name.toLowerCase().includes(Q)||t.unit.toLowerCase().includes(Q)){
          tenantHits.push({b,t});
        }
      });
    });
    if(tenantHits.length){
      html += '<div class="cmd-group-label">Kiracılar</div>';
      tenantHits.slice(0,6).forEach(({b,t})=>{
        const p = getP(t.id,S.month);
        const st = getStatus(t,S.month);
        const idx = cmdItems.length;
        cmdItems.push({action:()=>{goto('bld',b);setTimeout(()=>openPanel(b,t.id),200);closeKbd();}});
        html += `<div class="cmd-item" data-idx="${idx}" onclick="cmdRun(${idx})">
          <div class="cmd-item-icon">🏠</div>
          <div class="cmd-item-label">
            <div class="cmd-item-title">${t.name}</div>
            <div class="cmd-item-sub">${BL[b]} · ${t.unit} · ${TL(t.rent)}</div>
          </div>
          <span class="cmd-item-tag">${st.lbl}</span>
        </div>`;
      });
    }
  }

  // ── Buildings ──
  if(!Q||'gayrettepe karakol tan sokak'.includes(Q)){
    html += '<div class="cmd-group-label">Binalar</div>';
    BK.forEach(b=>{
      if(Q&&!BL[b].toLowerCase().includes(Q)) return;
      const idx = cmdItems.length;
      const paid = paidTotal(b,S.month), rent = rentTotal(b);
      cmdItems.push({action:()=>{goto('bld',b);closeKbd();}});
      html += `<div class="cmd-item" data-idx="${idx}" onclick="cmdRun(${idx})">
        <div class="cmd-item-icon">🏢</div>
        <div class="cmd-item-label">
          <div class="cmd-item-title">${BL[b]}</div>
          <div class="cmd-item-sub">${(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0).length} kiracı · ${TL(paid)}/${TL(rent)}</div>
        </div>
        <span class="cmd-item-tag">${rent>0?Math.round(paid/rent*100):0}%</span>
      </div>`;
    });
  }

  if(!cmdItems.length){
    html = '<div class="cmd-empty">🔍 Sonuç bulunamadı</div>';
  }

  results.innerHTML = html;
}

function cmdRun(idx){
  const item = cmdItems[idx];
  if(item&&item.action) item.action();
}

function cmdKey(e){
  const items = document.querySelectorAll('#cmd-results .cmd-item');
  if(e.key==='ArrowDown'){
    e.preventDefault();
    cmdSelectedIdx = Math.min(cmdSelectedIdx+1, items.length-1);
    items.forEach((el,i)=>el.classList.toggle('selected',i===cmdSelectedIdx));
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    cmdSelectedIdx = Math.max(cmdSelectedIdx-1, 0);
    items.forEach((el,i)=>el.classList.toggle('selected',i===cmdSelectedIdx));
  } else if(e.key==='Enter'){
    if(cmdSelectedIdx>=0) cmdRun(cmdSelectedIdx);
    else if(cmdItems.length>0) cmdRun(0);
  } else if(e.key==='Escape'){
    closeKbd();
  }
}

// Global Ctrl+K
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){
    e.preventDefault();
    const overlay = document.getElementById('cmd-overlay');
    if(overlay.classList.contains('open')) closeKbd();
    else openCMD();
  }
  if(e.key==='Escape') closeKbd();
});

// ═══════════════════════════════════════════════════════
// FAB
// ═══════════════════════════════════════════════════════
let fabOpen = false;
function toggleFAB(){
  fabOpen = !fabOpen;
  document.getElementById('fab-main').classList.toggle('open', fabOpen);
  document.getElementById('fab-menu').classList.toggle('open', fabOpen);
}
function closeFAB(){
  fabOpen = false;
  document.getElementById('fab-main').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
}
document.addEventListener('click', e=>{
  if(!document.getElementById('fab').contains(e.target)) closeFAB();
});

// ═══════════════════════════════════════════════════════
// SMART DASHBOARD WIDGETS
// ═══════════════════════════════════════════════════════
function renderSmartWidgets(m){
  const tRent = BK.reduce((s,b)=>s+rentTotal(b),0);
  const tPaid = BK.reduce((s,b)=>s+paidTotal(b,m),0);
  const tExp  = BK.reduce((s,b)=>s+expTotal(b,m),0);
  const tNet  = tPaid - tExp;
  const rate  = tRent>0 ? Math.round(tPaid/tRent*100) : 0;

  // Overdue stats
  let overdueCount=0, overdueAmount=0;
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0).forEach(t=>{
    if(isDue(t,m)){overdueCount++;overdueAmount+=t.rent-getP(t.id,m).paid;}
  }));

  // Building performance ranking
  const rankData = BK.map(b=>{
    const r=rentTotal(b), p=paidTotal(b,m);
    return {b, r, p, pct:r>0?p/r:0};
  }).sort((a,b2)=>b2.pct-a.pct);
  const maxR = Math.max(...rankData.map(d=>d.r));

  // Collection trend (last 6 months available)
  const mIdx = ALL_MONTHS.indexOf(m);
  const last6 = ALL_MONTHS.slice(Math.max(0,mIdx-5), mIdx+1);
  const trend6 = last6.map(mo=>({mo, paid:BK.reduce((s,b)=>s+paidTotal(b,mo),0)}));

  // Gauge SVG
  const angle = rate * 1.8; // 0-180 degrees
  const rad = angle * Math.PI/180;
  const cx=60,cy=60,r2=48;
  const x1=cx+r2*Math.cos(Math.PI), y1=cy+r2*Math.sin(Math.PI);
  const x2=cx+r2*Math.cos(Math.PI+rad*0.5*Math.PI/90), y2=cy+r2*Math.sin(Math.PI+rad*0.5*Math.PI/90);
  // Simple arc gauge
  const gaugeSVG=`<svg viewBox="0 0 120 70" style="width:100%;max-width:120px">
    <path d="M12,64 A52,52 0 0,1 108,64" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8" stroke-linecap="round"/>
    <path d="M12,64 A52,52 0 0,1 108,64" fill="none"
      stroke="${rate>=80?'#10b981':rate>=50?'#f59e0b':'#f43f5e'}" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${rate*1.634} 999"/>
    <text x="60" y="58" text-anchor="middle" font-size="18" font-weight="700" fill="white">${rate}%</text>
  </svg>`;

  // Sparkline SVG
  const vals = trend6.map(t=>t.paid);
  const maxV = Math.max(...vals,1);
  const pts = vals.map((v,i)=>`${i*(100/(Math.max(vals.length-1,1)))},${40-v/maxV*38}`).join(' ');
  const sparkline = vals.length>1?`<svg viewBox="0 0 100 44" style="width:100%;height:44px">
    <polyline points="${pts}" fill="none" stroke="var(--blue-l)" stroke-width="2" stroke-linejoin="round"/>
    ${vals.map((v,i)=>`<circle cx="${i*(100/Math.max(vals.length-1,1))}" cy="${40-v/maxV*38}" r="2.5" fill="var(--blue)"/>`).join('')}
  </svg>`:'';

  const rankRows = rankData.map((d,i)=>{
    const colors=['#f59e0b','#7d9ec8','#6b7280'];
    return `<div class="rank-item">
      <div class="rank-num" style="background:rgba(${i===0?'245,158,11':i===1?'125,158,200':'107,114,128'},.15);color:${colors[i]||'var(--ink-4)'}">${i+1}</div>
      <div style="flex:1;min-width:60px;font-size:12px;color:var(--ink-2)">${BL[d.b]}</div>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${d.pct*100}%;background:${i===0?'var(--amber)':i===1?'var(--blue)':'var(--ink-4)'}"></div></div>
      <div class="rank-label" style="font-size:11px;color:var(--ink-3)">${Math.round(d.pct*100)}%</div>
    </div>`;
  }).join('');

  return `<div class="smart-grid">
    <!-- Collection Rate Gauge -->
    <div class="widget">
      <div class="widget-title">📊 Tahsilat Oranı</div>
      <div class="gauge-wrap">
        <div>${gaugeSVG}</div>
        <div>
          <div class="widget-value">${TL(tPaid)}</div>
          <div class="widget-sub">/ ${TL(tRent)} hedef</div>
          <div class="widget-trend ${rate>=80?'trend-up':rate>=50?'trend-flat':'trend-down'}">
            ${rate>=80?'↑':'↓'} ${rate}% tahsil
          </div>
        </div>
      </div>
    </div>

    <!-- Net Income -->
    <div class="widget">
      <div class="widget-title">💰 Net Gelir</div>
      <div class="widget-value ${tNet>=0?'c-green':'c-red'}">${TL(tNet)}</div>
      <div class="widget-sub">${TL(tPaid)} tahsilat − ${TL(tExp)} gider</div>
      <div style="margin-top:12px;display:flex;gap:12px">
        <div style="flex:1;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:13px;font-weight:700;color:var(--emerald-l)">${TL(tPaid)}</div>
          <div style="font-size:10px;color:var(--ink-4);margin-top:2px">Tahsilat</div>
        </div>
        <div style="flex:1;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:13px;font-weight:700;color:var(--amber-l)">${TL(tExp)}</div>
          <div style="font-size:10px;color:var(--ink-4);margin-top:2px">Gider</div>
        </div>
      </div>
    </div>

    <!-- Overdue Stats -->
    <div class="widget" style="border-color:${overdueCount>0?'rgba(244,63,94,.2)':''}">
      <div class="widget-title">⚠️ Gecikmiş Ödemeler</div>
      <div class="widget-value c-red">${overdueCount}</div>
      <div class="widget-sub">daire · ${TL(overdueAmount)} toplam</div>
      ${overdueCount>0?`<button class="btn btn-danger btn-sm" style="margin-top:10px;width:100%" onclick="goto('wa')">
        Hatırlatıcı Gönder →
      </button>`:`<div class="widget-trend trend-up" style="margin-top:10px">✓ Gecikme yok</div>`}
    </div>

    <!-- Building Ranking -->
    <div class="widget">
      <div class="widget-title">🏆 Bina Sıralaması — ${m}</div>
      <div class="rank-list">${rankRows}</div>
    </div>

    <!-- Trend Sparkline -->
    ${vals.length>1?`<div class="widget" style="grid-column:span 2">
      <div class="widget-title">📈 Tahsilat Trendi (son ${trend6.length} ay)</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        ${trend6.map(t=>`<div style="font-size:9px;color:var(--ink-4);text-align:center">${t.mo.split(' ')[0].slice(0,3)}</div>`).join('')}
      </div>
      <div class="sparkline-wrap" style="height:60px">${sparkline}</div>
      <div style="display:flex;justify-content:space-between;margin-top:6px">
        ${trend6.map(t=>`<div style="font-size:9px;color:var(--ink-3);text-align:center">${t.paid>=1e6?(t.paid/1e6).toFixed(1)+'M':t.paid>=1000?Math.round(t.paid/1000)+'K':t.paid}</div>`).join('')}
      </div>
    </div>`:''}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// ANALYTICS PAGE
// ═══════════════════════════════════════════════════════
function renderAnalytics(){
  const m = S.month;
  return monthBar()+`
  <div class="analytics-tabs">
    <button class="a-tab active" onclick="switchAnalytics('monthly',this)">Aylık</button>
    <button class="a-tab" onclick="switchAnalytics('yearly',this)">Yıllık</button>
    <button class="a-tab" onclick="switchAnalytics('compare',this)">Karşılaştırma</button>
    <button class="a-tab" onclick="switchAnalytics('heatmap',this)">Isı Haritası</button>
  </div>
  <div id="analytics-content">${renderAnalyticsMonthly()}</div>`;
}

function switchAnalytics(tab, el){
  document.querySelectorAll('.a-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const fns = {monthly:renderAnalyticsMonthly, yearly:renderAnalyticsYearly,
    compare:renderAnalyticsCompare, heatmap:renderAnalyticsHeatmap};
  document.getElementById('analytics-content').innerHTML = (fns[tab]||renderAnalyticsMonthly)();
  if(tab==='monthly'||tab==='yearly'||tab==='compare') setTimeout(initAnalyticsCharts,50);
}

function renderAnalyticsMonthly(){
  return `<div class="smart-grid">
    ${renderSmartWidgets(S.month)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="chart-card"><div class="chart-title">Tahsilat vs Gider — ${S.month}</div><canvas id="ch-monthly-bar" height="200"></canvas></div>
    <div class="chart-card"><div class="chart-title">Ödeme Durumu Dağılımı</div><canvas id="ch-status-donut" height="200"></canvas></div>
  </div>`;
}

function renderAnalyticsYearly(){
  return `<div class="chart-card" style="margin-bottom:14px">
    <div class="chart-title">Yıllık Tahsilat Trendi (2025–2027)</div>
    <canvas id="ch-yearly" height="200"></canvas>
  </div>
  <div class="chart-card">
    <div class="chart-title">Aylık Net Gelir (Alper Hesabı)</div>
    <canvas id="ch-alper-yr" height="200"></canvas>
  </div>`;
}

function renderAnalyticsCompare(){
  return `<div class="chart-card" style="margin-bottom:14px">
    <div class="chart-title">Bina Karşılaştırması — ${S.month}</div>
    <canvas id="ch-compare" height="200"></canvas>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
    ${BK.map(b=>{
      const r=rentTotal(b),p=paidTotal(b,S.month),e=expTotal(b,S.month);
      const pct=r>0?Math.round(p/r*100):0;
      return `<div class="widget">
        <div class="widget-title">${BL[b]}</div>
        <div class="widget-value ${pct>=80?'c-green':pct>=50?'c-orange':'c-red'}">${pct}%</div>
        <div class="widget-sub">${TL(p)} / ${TL(r)}</div>
        <div style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-4);margin-bottom:3px"><span>Gider</span><span class="c-orange">${TL(e)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-4)"><span>Net</span><span class="${p-e>=0?'c-green':'c-red'}">${TL(p-e)}</span></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderAnalyticsHeatmap(){
  // Overdue heatmap: 12 months × 3 buildings
  const months12 = ALL_MONTHS.slice(0,24).filter((_,i)=>i%1===0).slice(-12);
  return `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">📊 Tahsilat Isı Haritası — Son 12 Ay</div></div>
    <div style="padding:16px;overflow-x:auto">
      <div style="display:grid;grid-template-columns:80px repeat(${months12.length},1fr);gap:4px;min-width:600px">
        <div></div>
        ${months12.map(mo=>`<div style="font-size:9px;color:var(--ink-4);text-align:center;padding:4px 0">${mo.split(' ')[0].slice(0,3)}</div>`).join('')}
        ${BK.map(b=>`
          <div style="font-size:11px;color:var(--ink-2);display:flex;align-items:center;padding-right:8px">${BL[b].slice(0,3)}</div>
          ${months12.map(mo=>{
            const r=rentTotal(b),p=paidTotal(b,mo);
            const pct=r>0?p/r:0;
            const c=pct>=0.9?'#10b981':pct>=0.7?'#f59e0b':pct>=0.4?'#f97316':pct>0?'#f43f5e':'rgba(255,255,255,.05)';
            return `<div title="${BL[b]} ${mo}: ${Math.round(pct*100)}%" style="height:28px;background:${c};border-radius:4px;opacity:${pct>0?0.4+pct*0.6:0.3};cursor:default;transition:transform .15s" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform=''"></div>`;
          }).join('')}
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:14px;font-size:10px;color:var(--ink-4)">
        <span>Düşük</span>
        <div style="display:flex;gap:3px">
          ${['#f43f5e','#f97316','#f59e0b','#10b981'].map(c=>`<div style="width:20px;height:10px;border-radius:2px;background:${c}"></div>`).join('')}
        </div>
        <span>Yüksek</span>
      </div>
    </div>
  </div>`;
}

function initAnalyticsCharts(){
  const m=S.month,theme={g:'rgba(255,255,255,.06)',t:'rgba(125,158,200,.6)'};
  const co={responsive:true,maintainAspectRatio:true,
    plugins:{legend:{labels:{color:theme.t,font:{size:11}}}},
    scales:{x:{ticks:{color:theme.t},grid:{color:theme.g}},
            y:{ticks:{color:theme.t,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.g}}}};

  const monthlyBar=document.getElementById('ch-monthly-bar');
  if(monthlyBar){
    if(monthlyBar._chart) monthlyBar._chart.destroy();
    monthlyBar._chart=new Chart(monthlyBar,{type:'bar',
      data:{labels:BK.map(b=>BL[b]),datasets:[
        {label:'Tahsilat',data:BK.map(b=>paidTotal(b,m)),backgroundColor:'rgba(16,185,129,.6)',borderRadius:4},
        {label:'Gider',data:BK.map(b=>expTotal(b,m)),backgroundColor:'rgba(245,158,11,.6)',borderRadius:4},
        {label:'Net',data:BK.map(b=>paidTotal(b,m)-expTotal(b,m)),backgroundColor:'rgba(59,130,246,.6)',borderRadius:4},
      ]},options:{...co,scales:{x:{ticks:{color:theme.t},grid:{color:theme.g}},y:{ticks:{color:theme.t,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.g}}}}
    });
  }

  const statusD=document.getElementById('ch-status-donut');
  if(statusD){
    let paid2=0,partial=0,unpaid=0;
    BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0).forEach(t=>{
      const p=getP(t.id,m);
      if(p.paid>=t.rent)paid2++;else if(p.paid>0)partial++;else unpaid++;
    }));
    if(statusD._chart) statusD._chart.destroy();
    statusD._chart=new Chart(statusD,{type:'doughnut',
      data:{labels:['Ödendi','Kısmi','Ödenmedi'],
        datasets:[{data:[paid2,partial,unpaid],backgroundColor:['rgba(16,185,129,.7)','rgba(245,158,11,.7)','rgba(244,63,94,.7)'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:true,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:theme.t}}}}
    });
  }

  const yearlyC=document.getElementById('ch-yearly');
  if(yearlyC){
    const months=MONTHS;
    if(yearlyC._chart) yearlyC._chart.destroy();
    yearlyC._chart=new Chart(yearlyC,{type:'line',
      data:{labels:months.map(m=>m.slice(0,3)),datasets:[
        {label:'2025',data:months.map(m2=>BK.reduce((s,b)=>s+paidTotal(b,m2+' 2025'),0)),borderColor:'rgba(59,130,246,.8)',backgroundColor:'rgba(59,130,246,.08)',tension:.3,fill:true,pointRadius:3},
        {label:'2026',data:months.map(m2=>BK.reduce((s,b)=>s+paidTotal(b,m2+' 2026'),0)),borderColor:'rgba(16,185,129,.8)',backgroundColor:'rgba(16,185,129,.08)',tension:.3,fill:true,pointRadius:3},
      ]},options:{...co}});
  }

  const alperYr=document.getElementById('ch-alper-yr');
  if(alperYr){
    const aKeys=Object.keys(DATA.alper);
    if(alperYr._chart) alperYr._chart.destroy();
    alperYr._chart=new Chart(alperYr,{type:'bar',
      data:{labels:aKeys,datasets:[
        {label:'Net',data:aKeys.map(k=>DATA.alper[k].net||0),backgroundColor:aKeys.map(k=>(DATA.alper[k].net||0)>=0?'rgba(16,185,129,.6)':'rgba(244,63,94,.6)'),borderRadius:3},
        {label:'Tahsilat',type:'line',data:aKeys.map(k=>DATA.alper[k].col||0),borderColor:'rgba(59,130,246,.6)',backgroundColor:'transparent',tension:.3,pointRadius:3,yAxisID:'y2'}
      ]},options:{...co,scales:{
        x:{ticks:{color:theme.t,maxRotation:45,font:{size:9}},grid:{color:theme.g}},
        y:{ticks:{color:theme.t,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.g}},
        y2:{position:'right',ticks:{color:'rgba(59,130,246,.6)',callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{display:false}}
      }}
    });
  }

  const compareC=document.getElementById('ch-compare');
  if(compareC){
    if(compareC._chart) compareC._chart.destroy();
    compareC._chart=new Chart(compareC,{type:'bar',
      data:{labels:BK.map(b=>BL[b]),datasets:[
        {label:'Kira',data:BK.map(b=>rentTotal(b)),backgroundColor:'rgba(59,130,246,.4)',borderRadius:4},
        {label:'Tahsilat',data:BK.map(b=>paidTotal(b,m)),backgroundColor:'rgba(16,185,129,.6)',borderRadius:4},
        {label:'Gider',data:BK.map(b=>expTotal(b,m)),backgroundColor:'rgba(245,158,11,.6)',borderRadius:4},
      ]},options:{...co,scales:{x:{ticks:{color:theme.t},grid:{color:theme.g}},y:{ticks:{color:theme.t,callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:theme.g}}}}
    });
  }
}

// ═══════════════════════════════════════════════════════
// ENHANCED renderDash — prepend smart widgets
// ═══════════════════════════════════════════════════════
const _origRenderDash = renderDash;
function renderDash(){
  const base = _origRenderDash();
  // Insert smart widgets after month bar (before cards)
  const insertAfter = '</div>\n  '; // after mbar closing div
  // Prepend smart widgets
  return base.replace(/<div class="kpi-grid">/, renderSmartWidgets(S.month) + '<div class="kpi-grid">');
}

// ═══════════════════════════════════════════════════════
// ENHANCED WA PAGE — phone management
// ═══════════════════════════════════════════════════════
const _origRenderWA = renderWA;
function renderWA(){
  const m = S.month;
  let sentCount=0,pendingCount=0,noPhoneCount=0;
  const sentKeys = DATA.waLog ? DATA.waLog.map(l=>`${l.mo}:${l.bina}:${l.unit}`) : [];

  const overdueList=[];
  BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>{
    if(!t.active||t.rent===0) return false;
    return isDue(t,m)||getP(t.id,m).paid<t.rent;
  }).forEach(t=>{
    const phone=(t.phone||'').replace(/\D/g,'');
    const alreadySent=sentKeys.includes(`${m}:${BL[b]}:${t.unit}`);
    if(alreadySent) sentCount++;
    else if(!phone) noPhoneCount++;
    else pendingCount++;
    overdueList.push({b,t,phone,alreadySent});
  }));

  const stats=`<div class="wa-stat-row">
    <div class="wa-stat-card"><div class="wa-stat-num c-red">${overdueList.length}</div><div class="wa-stat-lbl">Toplam Borçlu</div></div>
    <div class="wa-stat-card"><div class="wa-stat-num c-orange">${pendingCount}</div><div class="wa-stat-lbl">Gönderilmedi</div></div>
    <div class="wa-stat-card"><div class="wa-stat-num c-green">${sentCount}</div><div class="wa-stat-lbl">Gönderildi</div></div>
    <div class="wa-stat-card"><div class="wa-stat-num c-faint">${noPhoneCount}</div><div class="wa-stat-lbl">Telefon Yok</div></div>
  </div>`;

  const cards = overdueList.map(({b,t,phone,alreadySent})=>{
    const p=getP(t.id,m);
    const diff=t.rent-p.paid;
    const msg=buildWAMsg(b,t,m);
    const lastSent = DATA.waLog ? DATA.waLog.filter(l=>l.unit===t.unit&&l.bina===BL[b]).slice(-1)[0] : null;
    return `<div class="wa-reminder-card">
      <div class="wa-reminder-hdr">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--ink-0)">${BL[b]} · ${t.unit} — ${t.name}</div>
          <div style="font-size:11px;color:var(--ink-4);margin-top:2px">
            Borç: <span class="c-red">${TL(diff)}</span>
            · Ödenen: <span class="c-orange">${TL(p.paid)}</span>
            · Kira: <span class="c-blue">${TL(t.rent)}</span>
          </div>
        </div>
        ${alreadySent?'<span class="wa-sent-badge">✓ Gönderildi</span>':''}
      </div>
      <!-- Phone management -->
      <div class="wa-phone-row" style="margin-bottom:8px">
        <span style="font-size:11px;color:var(--ink-4)">📱</span>
        <input class="wa-phone-edit" type="tel" value="${t.phone||''}"
          placeholder="905xxxxxxxxx"
          onchange="updateTenantPhone('${b}','${t.id}',this.value)"
          onblur="updateTenantPhone('${b}','${t.id}',this.value)">
        ${lastSent?`<span class="wa-last-sent">Son: ${lastSent.t.slice(0,10)}</span>`:''}
      </div>
      <div class="wa-msg-box">${msg}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${phone?`<button class="wa-send-btn" onclick="waSendAndLog('${b}','${t.id}','${m}','${phone}',\`${msg.replace(/`/g,"'")}\`)">
          <span>💬</span> WhatsApp Gönder
        </button>`:
        `<span style="font-size:12px;color:var(--ink-4)">📵 Telefon girilmedi</span>`}
        ${canEdit()?`<button class="btn btn-success btn-sm" onclick="openModal('pay-add','${b}:${t.id}')">💳 Ödeme Gir</button>`:''}
      </div>
    </div>`;
  }).join('');

  const logRows = DATA.waLog ? DATA.waLog.slice(-30).reverse().map(l=>
    `<div class="wa-log-item">
      <span class="c-faint">${l.t.slice(0,16)}</span>
      <span style="flex:1">${l.bina} ${l.unit} – ${l.name}</span>
      <span class="c-faint">${l.mo}</span>
    </div>`
  ).join('') : '';

  return monthBar()+`
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <div style="font-size:15px;font-weight:700;color:var(--ink-0);flex:1">💬 WhatsApp Yönetimi — ${m}</div>
    ${pendingCount>0&&canEdit()?`<button class="btn btn-primary btn-sm" onclick="sendAllWA('${m}')">📤 Hepsine Gönder (${pendingCount})</button>`:''}
  </div>
  <div style="background:rgba(37,211,102,.05);border:1px solid rgba(37,211,102,.12);border-radius:var(--r-md);padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--ink-2);line-height:1.6">
    <b style="color:var(--ink-0)">Otomatik hatırlatıcı:</b> server.js çalışırken kira günü geçtikten sonra otomatik gönderir.<br>
    <b>Manuel:</b> Aşağıdaki butonlarla tek tek veya toplu gönderebilirsiniz. Telefon numarasını düzenleyebilirsiniz.
  </div>
  ${stats}
  ${overdueList.length?cards:`<div class="empty-state"><span class="empty-state-icon">✅</span><div class="empty-state-text">${m} için gecikmiş ödeme yok!</div></div>`}
  ${logRows?`<div class="sec-hdr" style="margin-top:16px">📋 Son Gönderimler</div>
  <div class="table-card"><div style="padding:4px 8px">${logRows}</div></div>`:''}`;
}

function updateTenantPhone(bname,tid,phone){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  t.phone=phone.trim();
  addHist(`${BL[bname]} ${t.unit} – ${t.name}: telefon güncellendi`);
  saveLocal();
  toast('📱 Telefon kaydedildi','green');
}

function waSendAndLog(bname,tid,mo,phone,msg){
  window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');
  logWA(bname,tid,mo);
  toast('💬 WhatsApp açıldı','green');
}

// ═══════════════════════════════════════════════════════
// SYNC STATUS BAR
// ═══════════════════════════════════════════════════════
function renderSyncBar(){
  if(!DATA.cloud.url) return '';
  const lastSync = DATA.cloud.lastSync ? new Date(DATA.cloud.lastSync).toLocaleString('tr-TR') : 'Bilinmiyor';
  const enabled = DATA.cloud.enabled;
  return `<div class="sync-bar ${enabled?'':'offline'}">
    <div class="sync-status-dot" style="background:${enabled?'var(--emerald)':'var(--rose)'}"></div>
    <div style="flex:1;min-width:0">
      <span style="font-size:12px;font-weight:600;color:var(--ink-1)">${enabled?'Bulut Bağlı':'Bağlantı Yok'}</span>
      <span style="color:var(--ink-4);margin-left:8px">Son sync: ${lastSync}</span>
    </div>
    <div class="sync-actions">
      <button class="btn btn-ghost btn-xs" onclick="cloudSync('pull').then(()=>render())">⬇ Pull</button>
      <button class="btn btn-primary btn-xs" onclick="cloudSync('push')">⬆ Push</button>
    </div>
  </div>`;
}

// Enhanced renderDash to include sync bar at top
const _rdOrig2 = renderDash;
// Don't double-wrap; the above already wraps _origRenderDash

// ═══════════════════════════════════════════════════════
// TIMELINE (enhanced History page)
// ═══════════════════════════════════════════════════════
const _origRenderHist = renderHist;
function renderHist(){
  const typeMap={
    'Giriş':    {color:'var(--blue)',icon:'🔐'},
    'ödeme':    {color:'var(--emerald)',icon:'💳'},
    'gider':    {color:'var(--amber)',icon:'💸'},
    'güncellendi':{color:'var(--violet)',icon:'✏️'},
    'eklendi':  {color:'var(--teal)',icon:'➕'},
    'çıkarıldı':{color:'var(--rose)',icon:'🚫'},
    'WA':       {color:'#25d366',icon:'💬'},
    'yedek':    {color:'var(--ink-3)',icon:'☁️'},
    'bulut':    {color:'var(--blue)',icon:'☁️'},
    'silindi':  {color:'var(--rose)',icon:'🗑'},
  };

  const filterButtons = Object.keys(typeMap).slice(0,6).map(k=>
    `<button class="filter-chip" onclick="filterHistory('${k}',this)">${typeMap[k].icon} ${k}</button>`
  ).join('');

  const entries = DATA.history.slice(0,100).map(h=>{
    const type = Object.keys(typeMap).find(k=>h.desc.toLowerCase().includes(k)) || 'default';
    const info = typeMap[type] || {color:'var(--ink-4)',icon:'•'};
    return `<div class="tl-entry" style="--tl-color:${info.color}">
      <div class="tl-entry-time">${h.t}</div>
      <div class="tl-entry-text">${info.icon} ${h.desc}</div>
      ${h.user?`<div class="tl-entry-user">by <b>${h.user}</b></div>`:''}
    </div>`;
  }).join('');

  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <div style="font-size:15px;font-weight:700;flex:1">🕐 Aktivite Geçmişi</div>
    <span style="font-size:12px;color:var(--ink-4)">${DATA.history.length} kayıt</span>
    <button class="btn btn-ghost btn-sm" onclick="DATA.history=[];addHist('Geçmiş temizlendi');render()">Temizle</button>
  </div>
  <div class="filter-bar" style="margin-bottom:16px">
    ${filterButtons}
    <button class="filter-chip" id="hist-filter-all" onclick="filterHistory('',this)">Tümü</button>
  </div>
  ${DATA.history.length?`<div class="timeline" id="history-timeline">${entries}</div>`:
    '<div class="empty-state"><span class="empty-state-icon">📋</span><div class="empty-state-text">Henüz aktivite yok</div></div>'}`;
}

function filterHistory(key,el){
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const tl = document.getElementById('history-timeline');
  if(!tl) return;
  const entries = tl.querySelectorAll('.tl-entry');
  entries.forEach(e=>{
    if(!key) e.style.display='';
    else e.style.display=e.textContent.toLowerCase().includes(key)?'':'none';
  });
}

// ═══════════════════════════════════════════════════════
// PDF RECEIPT
// ═══════════════════════════════════════════════════════
function generateReceipt(bname, tid, mo){
  const t=(DATA.tenants[bname]||[]).find(x=>x.id===tid);
  if(!t) return;
  const p=getP(tid,mo);
  const receiptNo='KTP-'+Date.now().toString().slice(-6);
  const w=window.open('','_blank','width=700,height=900');
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Kira Makbuzu ${receiptNo}</title>

</head><body>
<div class="receipt">
  <div class="header">
    <div class="logo">🏢 Kira Takip Pro<div class="logo-sub">Emlak Yönetim Sistemi</div></div>
    <div class="receipt-id">Makbuz No<strong>${receiptNo}</strong><div style="font-size:11px;color:#666;margin-top:4px">${new Date().toLocaleDateString('tr-TR')}</div></div>
  </div>
  <h1>Kira Makbuzu</h1>
  <div class="info-grid">
    <div class="info-item"><label>Kiracı</label><span>${t.name}</span></div>
    <div class="info-item"><label>Bina / Daire</label><span>${BL[bname]} — ${t.unit}</span></div>
    <div class="info-item"><label>Dönem</label><span>${mo}</span></div>
    <div class="info-item"><label>Ödeme Tarihi</label><span>${p.date||new Date().toLocaleDateString('tr-TR')}</span></div>
    <div class="info-item"><label>Ödeme Şekli</label><span>${p.sekil||'—'}</span></div>
    <div class="info-item"><label>Aylık Kira</label><span>${TL(t.rent)}</span></div>
  </div>
  <div class="amount-box">
    <div class="amount-label">ÖDENEN TUTAR</div>
    <div class="amount-val">${TL(p.paid)}</div>
  </div>
  ${p.notes?`<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px">
    <b>Not:</b> ${p.notes}</div>`:''}
  <div class="divider"></div>
  <div class="stamp">✓</div>
  <div class="footer">
    Bu makbuz Kira Takip Pro sistemi tarafından otomatik oluşturulmuştur.<br>
    Herhangi bir sorun için lütfen iletişime geçiniz.<br>
    <strong>${new Date().toLocaleString('tr-TR')}</strong>
  </div>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
  w.document.close();
  addHist(`${BL[bname]} ${t.unit} – ${t.name}: makbuz oluşturuldu (${mo})`);
}

// ═══════════════════════════════════════════════════════
// EXCEL EXPORT (enhanced)
// ═══════════════════════════════════════════════════════
function exportExcel(){
  // Using CSV with BOM that Excel opens correctly
  const m = S.month;
  let csv = '\uFEFFBina,Daire,Kat,Kiracı,Telefon,Kira (TL),Ödenen (TL),Fark (TL),Durum,Ödeme Tarihi,Ödeme Şekli,Not,Kontrat Başlangıç,Depozito\n';
  BK.forEach(b=>{
    sortU(DATA.tenants[b]||[]).forEach(t=>{
      const p=getP(t.id,m); const st=getStatus(t,m);
      csv+=`${BL[b]},${t.unit},${t.fl||''},${t.name},${t.phone||''},${t.rent},${p.paid},${p.paid-t.rent},${st.lbl},${p.date||''},${p.sekil||''},${p.notes||''},${t.bas||''},${t.dep||0}\n`;
    });
    csv+=',,,,,,,,,,,,,,\n';
  });
  csv+='\n\nGİDERLER\nBina,Sayaç/No,Tür,Tutar (TL),Tarih,Not\n';
  BK.forEach(b=>{
    ((DATA.expenses[b]||{})[m]||[]).forEach(e=>{
      csv+=`${BL[b]},${e.no||''},${e.tur},${e.tutar},${e.tarih||''},${e.notlar||''}\n`;
    });
  });
  csv+='\n\nALPER HESABI\nAy,Tahsilat,Gider,Net\n';
  Object.keys(DATA.alper).forEach(mo=>{
    const a=DATA.alper[mo];
    csv+=`${mo},${a.col||0},${a.exp||0},${a.net||0}\n`;
  });
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'application/vnd.ms-excel;charset=utf-8'}));
  a.download=`KiraTakip_${m.replace(' ','_')}_${new Date().toISOString().slice(0,10)}.xls`;
  a.click();
  addHist(`Excel export: ${m}`);
  toast('📊 Excel indirildi','green');
}

// ═══════════════════════════════════════════════════════
// ADD analytics to goto() and render()
// ═══════════════════════════════════════════════════════
const _origGoto = goto;
function goto(page,bld){
  _origGoto(page,bld);
}

// Patch render to include analytics tab
const _origRender = render;
function render(){
  const c=document.getElementById('content');
  if(!c) return;
  // Force reflow for animation restart
  c.className='';void c.offsetWidth;
  c.className='page-enter';
  const pages={
    dash:renderDash,pay:renderPay,exp:renderExp,
    alper:renderAlper,charts:renderCharts,wa:renderWA,
    rep:renderRep,hist:renderHist,viz:renderViz,
    analytics:renderAnalytics,
    bld:()=>renderBld(S.bld)
  };
  c.innerHTML=(pages[S.page]||renderDash)();
  if(S.page==='charts') initCharts();
  if(S.page==='viz') initViz();
  if(S.page==='analytics') setTimeout(initAnalyticsCharts,100);
  if(DATA.settings.autoSave) saveLocal();
  // Scroll active month button into view
  setTimeout(()=>{
    const active=document.querySelector('.mbtn.active');
    if(active) active.scrollIntoView({behavior:'instant',block:'nearest',inline:'center'});
  },30);
}

// Add analytics to sidebar on init
function addAnalyticsNav(){
  const nb = document.getElementById('nb-charts');
  if(nb&&!document.getElementById('nb-analytics')){
    const a=document.createElement('button');
    a.className='nav';a.id='nb-analytics';
    a.innerHTML='<span class="ni">◗</span>Analitik';
    a.onclick=()=>goto('analytics');
    nb.parentNode.insertBefore(a,nb.nextSibling);
  }
}

// ═══════════════════════════════════════════════════════
// ENHANCED REPORTS with receipt button
// ═══════════════════════════════════════════════════════
const _origRenderRep = renderRep;
function renderRep(){
  const m = S.month;
  const secs = BK.map(b=>{
    const ts=sortU((DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0));
    const exs=((DATA.expenses[b]||{})[m]||[]);
    const paid=paidTotal(b,m),ex=expTotal(b,m),net=paid-ex;
    return `
    <div class="sec-hdr">🏢 ${BL[b]}</div>
    <div class="kpi-grid" style="margin-bottom:10px">
      <div class="kpi-card" style="--kpi-color:var(--blue-l)"><span class="kpi-icon">💰</span><div class="kpi-value">${TL(ts.reduce((s,t)=>s+t.rent,0))}</div><div class="kpi-label">Toplam Kira</div></div>
      <div class="kpi-card" style="--kpi-color:var(--emerald-l)"><span class="kpi-icon">✅</span><div class="kpi-value">${TL(paid)}</div><div class="kpi-label">Tahsil</div></div>
      <div class="kpi-card" style="--kpi-color:var(--amber-l)"><span class="kpi-icon">💸</span><div class="kpi-value">${TL(ex)}</div><div class="kpi-label">Gider</div></div>
      <div class="kpi-card" style="--kpi-color:${net>=0?'var(--emerald-l)':'var(--rose-l)'}"><span class="kpi-icon">📈</span><div class="kpi-value">${TL(net)}</div><div class="kpi-label">Net</div></div>
    </div>
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-card-header"><div class="table-card-title">Daire Ödemeleri</div></div>
      <div class="table-scroller"><table>
        <thead><tr><th>Daire</th><th>Kiracı</th><th>Kira</th><th>Ödenen</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
        <tbody>${ts.map(t=>{const p=getP(t.id,m);const st=getStatus(t,m);
          return '<tr><td>'+t.unit+'</td><td>'+t.name+'</td><td class="c-blue">'+TL(t.rent)+'</td><td class="'+(p.paid>=(t.rent||0)?'c-green':p.paid>0?'c-orange':'c-red')+'">'+TL(p.paid)+'</td><td><span class="badge '+(st.cls||'b-gray')+'">'+st.lbl+'</span></td><td class="c-faint">'+(p.date?p.date.slice(0,10):'—')+'</td><td>'+
          (p.paid>0&&canEdit()?`<button class="btn btn-ghost btn-xs" onclick="generateReceipt('${b}','${t.id}','${m}')">🧾 Makbuz</button>`:'')+'</td></tr>';
        }).join('')}</tbody>
      </table></div>
    </div>
    <div class="table-card" style="margin-bottom:20px">
      <div class="table-card-header"><div class="table-card-title">Giderler</div></div>
      <div class="table-scroller"><table>
        <thead><tr><th>Sayaç/No</th><th>Gider</th><th>Tutar</th><th>Tarih</th></tr></thead>
        <tbody>${exs.map(e=>'<tr><td class="mono">'+(e.no||'—')+'</td><td>'+e.tur+'</td><td class="c-orange">'+TL(e.tutar)+'</td><td class="c-faint">'+(e.tarih||'—')+'</td></tr>').join('')||'<tr><td colspan="4" class="empty-state-text">Gider yok</td></tr>'}
        ${exs.length?'<tr class="tfoot-row"><td colspan="2">TOPLAM</td><td class="c-orange">'+TL(ex)+'</td><td></td></tr>':''}
        </tbody>
      </table></div>
    </div>`;
  }).join('');

  return monthBar()+`
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
    <h3 style="font-size:15px;font-weight:700;flex:1;color:var(--ink-0)">📄 Rapor — ${m}</h3>
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Yazdır</button>
    <button class="btn btn-secondary btn-sm" onclick="exportCSV()">📤 CSV</button>
    <button class="btn btn-success btn-sm" onclick="exportExcel()">📊 Excel</button>
  </div>
  ${secs}`;
}

// ═══════════════════════════════════════════════════════
// PATCH initApp to add features
// ═══════════════════════════════════════════════════════
const _origInitApp = initApp;
function initApp(){
  _origInitApp();
  addAnalyticsNav();
  // Update goto idMap
  // already handled via goto() pattern above
}



function tplSettings(){
  const isA=isAdmin();
  return `<div class="modal-title">⚙️ Ayarlar</div>

  <div class="form-row">
    <label class="form-label">Otomatik Kayıt</label>
    <select class="form-select" id="s_auto" ${!isA?'disabled':''}>
      <option value="1" ${DATA.settings?.autoSave?'selected':''}>Açık (30 saniyede bir)</option>
      <option value="0" ${!DATA.settings?.autoSave?'selected':''}>Kapalı</option>
    </select>
  </div>

  <div class="div-line"></div>
  <div style="font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:10px">🗄 Veri Yönetimi</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn btn-ghost btn-sm" onclick="exportJSON()">📤 JSON Yedek İndir</button>
    <button class="btn btn-ghost btn-sm" onclick="exportCSV()">📊 CSV İndir</button>
    <button class="btn btn-ghost btn-sm" onclick="exportExcel()">📗 Excel İndir</button>
    <label class="btn btn-ghost btn-sm" style="cursor:pointer">
      📥 JSON Yükle
      <input type="file" accept=".json" style="display:none" onchange="importJSON(this)">
    </label>
  </div>

  ${isA?`<div class="div-line"></div>
  <div style="font-size:12px;font-weight:700;color:var(--rose-l);margin-bottom:10px">⚠️ Tehlikeli Bölge</div>
  <button class="btn btn-danger btn-sm" onclick="if(confirm('TÜM VERİ SİLİNECEK! Emin misiniz?')){localStorage.clear();location.reload()}">
    🗑 Tüm Verileri Sıfırla
  </button>`:''}

  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeMod()">Kapat</button>
    ${isA?'<button class="btn btn-primary" onclick="saveSettings_()">💾 Kaydet</button>':''}
  </div>`;
}

function saveSettings_(){
  if(!DATA.settings) DATA.settings={};
  DATA.settings.autoSave=document.getElementById('s_auto')?.value==='1';
  saveLocal();
  closeMod();
  toast('✅ Ayarlar kaydedildi','green');
}

function importJSON(inp){
  const f=inp.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const d=JSON.parse(e.target.result);
      if(d.tenants) DATA.tenants=d.tenants;
      if(d.payments) DATA.payments=d.payments;
      if(d.expenses) DATA.expenses=d.expenses;
      if(d.alper) DATA.alper=d.alper;
      if(d.history) DATA.history=d.history;
      if(d.users) DATA.users=d.users;
      if(d.waLog) DATA.waLog=d.waLog;
      autoRecalc(); saveLocal(); render(); updateBadges();
      addHist('JSON yedek yüklendi: '+f.name);
      toast('✅ Veri yüklendi','green');
      closeMod();
    }catch(err){toast('❌ JSON formatı hatalı','red');}
  };
  r.readAsText(f);
}

// ═══════════════════════════════════════════════
// AUTO TIMERS (30s autosave, 5min cloud sync)
// ═══════════════════════════════════════════════
setInterval(()=>{if(DATA.settings.autoSave){autoRecalc();saveLocal();}},30000);
setInterval(()=>{
  if(DATA.cloud.enabled&&DATA.cloud.url&&DATA.cloud.token){
    cloudSync('push').then(()=>{/* auto-sync logged inside cloudSync */}).catch(()=>{});
  }
},300000);

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
loadLocal();
autoRecalc();
renderLogin();

// ════════════════════════════════════════════════════════════
// ELECTRON BRIDGE — integrates with main process
// Falls back gracefully when running in browser (non-Electron)
// ════════════════════════════════════════════════════════════
const isElectron = typeof window.electron !== 'undefined' && window.electron.isElectron === true;

// ── Enhanced saveLocal: also push to SQLite audit log ──────
const _origSaveLocal = saveLocal;
function saveLocal(){
  _origSaveLocal();
  // Persist selected month in Electron settings
  if(isElectron && S && S.month){
    window.electron.setSetting('selected_month', S.month).catch(()=>{});
  }
}

// ── Enhanced addHist: also write to SQLite audit log ───────
const _origAddHist = addHist;
function addHist(desc){
  _origAddHist(desc);
  if(isElectron){
    const user = currentUser ? currentUser.name : 'System';
    window.electron.addAudit({t: new Date().toISOString(), user, desc}).catch(()=>{});
  }
}

// ── Enhanced exportJSON: use native Save dialog in Electron ─
const _origExportJSON = exportJSON;
function exportJSON(){
  if(!isElectron){ _origExportJSON(); return; }
  const dataStr = JSON.stringify({
    tenants:DATA.tenants, payments:DATA.payments, expenses:DATA.expenses,
    alper:DATA.alper, tanNet:DATA.tanNet, gayNet:DATA.gayNet,
    history:DATA.history, waLog:DATA.waLog, users:DATA.users, settings:DATA.settings
  }, null, 2);
  window.electron.exportJSON(dataStr).then(result => {
    if(result.ok) toast('💾 JSON yedek kaydedildi: ' + result.path, 'green');
    else if(result.ok === false && !result.path) toast('İptal edildi','orange');
  }).catch(e => toast('❌ Dışa aktarma hatası: ' + e.message,'red'));
}

// ── Enhanced importJSON: use native Open dialog in Electron ─
const _origImportJSON_renderer = typeof importJSON === 'function' ? importJSON : null;
function importJSON(inp){
  if(!isElectron){ if(_origImportJSON_renderer) _origImportJSON_renderer(inp); return; }
  window.electron.importJSON().then(result => {
    if(!result.ok){ if(!result.error) return; toast('❌ ' + result.error,'red'); return; }
    try{
      const d = JSON.parse(result.data);
      // Schema validation before committing
      if(!d||typeof d!=='object'){toast('❌ Geçersiz yedek: JSON nesnesi değil','red');return;}
      if(!d.tenants&&!d.payments&&!d.users){toast('❌ Bu Kira Takip yedek dosyası değil','red');return;}
      const miss=[];
      if(!d.tenants)miss.push('kiracılar');if(!d.payments)miss.push('ödemeler');if(!d.expenses)miss.push('giderler');
      if(miss.length&&!confirm('Eksik bölümler: '+miss.join(', ')+'. Yine de yüklensin mi?'))return;
      // Snapshot for recovery
      window._lastImportSnapshot=JSON.stringify(DATA);
      if(d.tenants)  DATA.tenants  = d.tenants;
      if(d.payments) DATA.payments = d.payments;
      if(d.expenses) DATA.expenses = d.expenses;
      if(d.alper)    DATA.alper    = d.alper;
      if(d.history)  DATA.history  = d.history;
      if(d.users)    DATA.users    = d.users;
      if(d.waLog)    DATA.waLog    = d.waLog;
      autoRecalc(); saveLocal(); render(); updateBadges();
      addHist('JSON yedek yüklendi');
      toast('✅ Veri yüklendi','green');
      closeMod();
    }catch(err){ toast('❌ JSON hatası: '+err.message,'red'); }
  });
}

// ════════════════════════════════════════════════════════════════
// ABOUT / STATUS PAGE (Hakkında & Veri Konumları)
// ════════════════════════════════════════════════════════════════
async function renderAbout(){
  let info={version:'5.1.0',dbPath:'N/A',backupDir:'N/A',userData:'N/A',isDev:false,logPath:'N/A',electronVersion:'',nodeVersion:'browser',platform:'web'};
  let status={dbConnected:false,backupCount:0};
  let backups=[];

  if(isElectron){
    try{info=await window.electron.getInfo();}catch{}
    try{status=await window.electron.getStatus();}catch{}
    try{backups=await window.electron.listBackups();}catch{}
  }

  const cloudEnabled=DATA.cloud?.enabled;
  const lastSync=DATA.cloud?.lastSync?new Date(DATA.cloud.lastSync).toLocaleString('tr-TR'):'—';

  document.getElementById('content').innerHTML=`
  <div style="max-width:800px">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div style="width:64px;height:64px;background:linear-gradient(135deg,var(--blue),var(--violet));
        border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:30px;
        box-shadow:0 8px 24px rgba(59,130,246,.3)">🏢</div>
      <div>
        <div style="font-size:22px;font-weight:700;color:var(--i0);letter-spacing:-.4px">Kira Takip Pro</div>
        <div style="font-size:12px;color:var(--i4)">Emlak Yönetim Sistemi</div>
        <div style="font-size:11px;color:var(--blue-l);margin-top:2px;font-family:var(--mono)">v${info.version}</div>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="kpi-card" style="--kpi-color:${status.dbConnected?'var(--emerald-l)':'var(--rose-l)'}">
        <span class="kpi-icon">🗄</span>
        <div class="kpi-value">${status.dbConnected?'Bağlı':'Yok'}</div>
        <div class="kpi-label">SQLite Veritabanı</div>
      </div>
      <div class="kpi-card" style="--kpi-color:${cloudEnabled?'var(--emerald-l)':'var(--i4)'}">
        <span class="kpi-icon">☁️</span>
        <div class="kpi-value">${cloudEnabled?'Aktif':'Kapalı'}</div>
        <div class="kpi-label">Bulut Sync</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--blue-l)">
        <span class="kpi-icon">💾</span>
        <div class="kpi-value">${status.backupCount}</div>
        <div class="kpi-label">Yedek Sayısı</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--violet-l)">
        <span class="kpi-icon">👤</span>
        <div class="kpi-value" style="font-size:13px">${currentUser?.name||'—'}</div>
        <div class="kpi-label">${currentUser?roleLabel(currentUser.role):'Giriş yok'}</div>
      </div>
    </div>

    <div class="table-card" style="margin-bottom:14px">
      <div class="table-card-header"><div class="table-card-title">📁 Veri Konumları</div></div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:10px">
        ${[['Veritabanı (.db)',info.dbPath],['Yedek Klasörü',info.backupDir],
           ['Uygulama Verisi',info.userData],['Log Dosyası',info.logPath||'N/A']].map(([l,v])=>
          `<div style="display:flex;align-items:center;gap:10px">
            <span style="min-width:140px;font-size:12px;color:var(--i4)">${l}</span>
            <code style="flex:1;font-size:11px;color:var(--i2);background:rgba(0,0,0,.2);
              border-radius:6px;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;
              white-space:nowrap;font-family:var(--mono)">${v||'N/A'}</code>
          </div>`).join('')}
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${isElectron?`
      <button class="btn btn-secondary btn-sm" onclick="window.electron.openBackupFolder()">📂 Yedek Klasörü</button>
      <button class="btn btn-secondary btn-sm" onclick="window.electron.openFolder()">📂 Veri Klasörü</button>
      <button class="btn btn-primary btn-sm" onclick="doElectronBackup()">💾 Şimdi Yedekle</button>
      `:''}
      <button class="btn btn-ghost btn-sm" onclick="exportJSON()">📤 JSON Dışa Aktar</button>
      <button class="btn btn-ghost btn-sm" onclick="exportCSV()">📊 CSV İndir</button>
    </div>

    ${backups.length?`
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-card-header"><div class="table-card-title">💾 Son Yedekler</div></div>
      <div class="table-scroller"><table>
        <thead><tr><th>Dosya</th><th>Boyut</th><th>Tarih</th><th></th></tr></thead>
        <tbody>${backups.slice(0,8).map(b=>`<tr>
          <td class="mono" style="font-size:10.5px">${b.filename}</td>
          <td class="c-faint">${(b.size/1024).toFixed(1)} KB</td>
          <td class="c-faint">${b.mtime.slice(0,19).replace('T',' ')}</td>
          <td>${isElectron&&b.filename.endsWith('.db')?`<button class="btn btn-ghost btn-xs" onclick="doRestoreFrom('${b.path.replace(/\\/g,'/')}')">↩ Yükle</button>`:''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}

    <div style="font-size:10.5px;color:var(--i5);line-height:1.8;font-family:var(--mono)">
      ${info.electronVersion?`Electron: ${info.electronVersion} · `:''}
      Node.js: ${info.nodeVersion||'browser'} ·
      Platform: ${info.platform||'web'} ·
      ${info.isDev?'<span style="color:var(--amber-l)">DEV MODE</span>':'Production'}
    </div>
    ${lastSync&&lastSync!=='—'?`<div style="font-size:10.5px;color:var(--i5);margin-top:4px">
      Son Bulut Sync: <span style="font-family:var(--mono)">${lastSync}</span>
    </div>`:''}
  </div>`;
}

async function doElectronBackup(){
  if(!isElectron) return;
  const result=await window.electron.createBackup('manual');
  if(result) toast('💾 Yedek alındı: '+result.filename,'green');
  else toast('❌ Yedek alınamadı','red');
}

async function doRestoreFrom(filePath){
  if(!confirm('Bu yedek geri yüklensin mi?\n'+filePath)) return;
  const res=await window.electron.restoreBackup(filePath);
  if(res.ok) toast('✅ Geri yüklendi — uygulamayı yeniden başlatın','green');
  else toast('❌ '+res.error,'red');
}

async function restoreElectronState(){
  if(!isElectron) return;
  try{
    const mo=await window.electron.getSetting('selected_month');
    if(mo&&ALL_MONTHS.includes(mo)) S.month=mo;
  }catch{}
}

// ── Patch initApp to add About sidebar item ───────────────────────────────────
const _origInitApp2=initApp;
function initApp(){
  _origInitApp2();
  restoreElectronState().then(()=>render());
  addAboutToSidebar();
}

function addAboutToSidebar(){
  const footer=document.querySelector('.sb-footer');
  if(!footer||document.getElementById('nb-about')) return;
  const btn=document.createElement('button');
  btn.className='nav';btn.id='nb-about';
  btn.innerHTML='<span class="ni">ℹ</span>Hakkında / Veriler';
  btn.onclick=()=>{
    document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('topbar-title').textContent='ℹ Hakkında & Veri Konumları';
    renderAbout();
  };
  footer.insertBefore(btn,footer.firstChild);
}

// ── Patch render to include analytics ────────────────────────────────────────
const _origRender2=render;
function render(){
  const c=document.getElementById('content');
  if(!c) return;
  c.className='';void c.offsetWidth;c.className='page-enter';
  const pages={
    dash:renderDash,pay:renderPay,exp:renderExp,
    alper:renderAlper,charts:renderCharts,wa:renderWA,
    rep:renderRep,hist:renderHist,viz:renderViz,
    analytics:renderAnalytics,bld:()=>renderBld(S.bld)
  };
  c.innerHTML=(pages[S.page]||renderDash)();
  if(S.page==='charts') initCharts();
  if(S.page==='viz') initViz();
  if(S.page==='analytics') setTimeout(initAnalyticsCharts,100);
  // Scroll active month into view
  setTimeout(()=>{
    const active=document.querySelector('.mbtn.active');
    if(active) active.scrollIntoView({behavior:'instant',block:'nearest',inline:'center'});
  },30);
  if(DATA.settings?.autoSave) saveLocal();
}

// ── Electron bridge status ────────────────────────────────────────────────────
if(isElectron){
  console.log('[Electron] Bridge active. v5.1.0');
} else {
  console.log('[Browser] Running in browser mode');
}



/* ═══════════════════════════════════════════════════════
   HOTFIX v5.1.5 — navigation/init/render stability
   Fixes recursive patched goto/initApp and blank pages.
═══════════════════════════════════════════════════════ */
(function(){
  function safePage(fn){
    try { return fn ? fn() : renderDash(); }
    catch(e){
      console.error('[KTP render error]', e);
      return `<div style="padding:24px;border:1px solid rgba(244,63,94,.35);background:rgba(244,63,94,.08);border-radius:14px;color:#fff">
        <h2 style="margin-bottom:8px">⚠️ Sayfa yüklenemedi</h2>
        <p style="color:#a8b8d8;margin-bottom:10px">Bu bölüm render edilirken hata oluştu. Uygulama durmadı; başka menüleri kullanabilirsiniz.</p>
        <pre style="white-space:pre-wrap;color:#fb7185;font-size:12px">${String(e && (e.stack||e.message) || e).replace(/[<>&]/g, ch=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch]))}</pre>
      </div>`;
    }
  }

  window.goto = goto = function(page,bld){
    S.page = page || 'dash';
    S.bld = bld || null;
    S.search = '';
    document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
    const idMap = {
      dash:'nb-dash', pay:'nb-pay', exp:'nb-exp', alper:'nb-alper',
      charts:'nb-charts', wa:'nb-wa', rep:'nb-rep', hist:'nb-hist', viz:'nb-viz',
      analytics:'nb-analytics', bld:bld ? 'nb-'+BS[bld] : ''
    };
    const activeId = idMap[S.page];
    const activeEl = activeId ? document.getElementById(activeId) : null;
    if(activeEl) activeEl.classList.add('active');
    const titles = {
      dash:'📊 Dashboard', pay:'💳 Tüm Ödemeler', exp:'💸 Tüm Giderler',
      alper:'🤝 Alper Hesabı', charts:'📈 Grafikler', wa:'💬 WhatsApp',
      rep:'📄 Raporlar', hist:'🕐 Geçmiş', viz:'🌐 3D Görünüm',
      analytics:'◗ Analitik', bld:'🏢 '+(BL[bld]||bld||'')
    };
    const t = document.getElementById('topbar-title');
    if(t) t.textContent = titles[S.page] || S.page;
    render();
    updateBadges();
  };

  window.render = render = function(){
    const c = document.getElementById('content');
    if(!c) return;
    c.className=''; void c.offsetWidth; c.className='page-enter';
    const pages = {
      dash:renderDash, pay:renderPay, exp:renderExp, alper:renderAlper,
      charts:renderCharts, wa:renderWA, rep:renderRep, hist:renderHist,
      viz:renderViz, analytics: (typeof renderAnalytics==='function'?renderAnalytics:renderCharts),
      bld:()=>renderBld(S.bld)
    };
    c.innerHTML = safePage(pages[S.page] || renderDash);
    try { if(S.page==='charts') initCharts(); } catch(e){ console.error(e); }
    try { if(S.page==='viz') initViz(); } catch(e){ console.error(e); }
    try { if(S.page==='analytics' && typeof initAnalyticsCharts==='function') setTimeout(initAnalyticsCharts,100); } catch(e){ console.error(e); }
    setTimeout(()=>{
      const active=document.querySelector('.mbtn.active');
      if(active) active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    },30);
    try { if(DATA.settings && DATA.settings.autoSave) saveLocal(); } catch(e){ console.error(e); }
  };

  window.initApp = initApp = function(){
    if(!currentUser){
      const users = DATA.users && DATA.users.length ? DATA.users : DEFAULT_USERS;
      currentUser = users.find(u=>u.role==='admin') || users[0] || {name:'Admin',role:'admin',avatar:'A',color:'#4a8af4'};
    }
    const login = document.getElementById('login-screen');
    if(login) login.style.display = 'none';
    const av=document.getElementById('sb-uav');
    const nm=document.getElementById('sb-uname');
    const rl=document.getElementById('sb-urole');
    if(av){ av.textContent=currentUser.avatar || (currentUser.name||'U').slice(0,1); av.style.background=currentUser.color||'#4a8af4'; }
    if(nm) nm.textContent=currentUser.name || 'Kullanıcı';
    if(rl) rl.textContent=roleLabel(currentUser.role||'viewer');
    ['btn-pay','btn-exp','btn-ten','btn-addpay','btn-addexp','btn-addten'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.style.display = canEdit() ? '' : 'none';
    });
    const nbUsers=document.getElementById('nb-users');
    if(nbUsers) nbUsers.style.display = isAdmin() ? '' : 'none';
    try { updateCloudUI(); } catch(e){ console.error(e); }
    try { addAnalyticsNav && addAnalyticsNav(); } catch(e){}
    try { addAboutToSidebar && addAboutToSidebar(); } catch(e){}
    render();
    updateBadges();
  };

  // Start app safely. Show login if no user selected; auto-enter admin if login screen is not usable.
  setTimeout(()=>{
    try{
      const login = document.getElementById('login-screen');
      const content = document.getElementById('content');
      if(login && login.style.display !== 'none'){
        // login remains available; do not force if user list rendered
        if(!document.getElementById('login-users')?.innerHTML){ renderLogin(); }
      }
      // If a previous broken run hid login but content is empty, recover by entering admin.
      if(content && !content.innerHTML.trim() && (!login || login.style.display==='none')) initApp();
    }catch(e){ console.error('[KTP startup recovery]',e); }
  },150);
})();


/* ═══════════════════════════════════════════════════════
   HOTFIX v5.1.5b — remove recursive save/addHist/renderDash
═══════════════════════════════════════════════════════ */
(function(){
  window.saveLocal = saveLocal = function(){
    try{
      localStorage.setItem(LSKEY, JSON.stringify(DATA));
      const t=new Date();
      const lbl=document.getElementById('save-lbl');
      if(lbl) lbl.textContent=`Kaydedildi ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      if(typeof window.electron!=='undefined' && window.electron && window.electron.isElectron && S && S.month){
        window.electron.setSetting('selected_month', S.month).catch(()=>{});
      }
    }catch(e){ console.error('[saveLocal]',e); }
  };

  window.addHist = addHist = function(desc){
    try{
      const user=currentUser?currentUser.name:'Sistem';
      if(!DATA.history) DATA.history=[];
      DATA.history.unshift({t:new Date().toLocaleString('tr-TR'),desc,user});
      if(DATA.history.length>500) DATA.history.length=500;
      saveLocal();
      if(typeof window.electron!=='undefined' && window.electron && window.electron.isElectron){
        window.electron.addAudit({t:new Date().toISOString(),user,desc}).catch(()=>{});
      }
    }catch(e){ console.error('[addHist]',e); }
  };

  window.renderDash = renderDash = function(){
    const m=S.month;
    let tRent=0,tPaid=0,tExp=0;
    const brows=BK.map(b=>{
      const ts=(DATA.tenants[b]||[]).filter(t=>t.active&&t.rent>0);
      const rent=ts.reduce((s,t)=>s+t.rent,0);
      const paid=paidTotal(b,m);
      const ex=expTotal(b,m);
      const net=paid-ex;
      const unpaid=ts.filter(t=>getP(t.id,m).paid<t.rent).length;
      tRent+=rent;tPaid+=paid;tExp+=ex;
      const pct=rent>0?Math.min(100,Math.round(paid/rent*100)):0;
      return `<tr class="cp" onclick="goto('bld','${b}')">
        <td><b>${BL[b]}</b></td>
        <td class="c-muted">${ts.length}</td>
        <td class="c-blue fw-700">${TL(rent)}</td>
        <td><div class="${paid>=rent?'c-green':'c-orange'} fw-700">${TL(paid)}</div><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${paid>=rent?'var(--emerald)':'var(--amber)'}"></div></div></td>
        <td class="${unpaid?'c-red':'c-green'} fw-700">${unpaid?'⚠️ '+unpaid:'✅'}</td>
        <td class="c-orange">${TL(ex)}</td>
        <td class="${net>=0?'c-green':'c-red'} fw-700">${TL(net)}</td>
        <td><span class="badge b-blue">Görüntüle →</span></td>
      </tr>`;
    }).join('');

    const net=tPaid-tExp;
    let overdue='';
    BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>isDue(t,m)).forEach(t=>{
      overdue+=`<tr><td><b>${BL[b]}</b></td><td>${t.unit}</td><td><span class="blink">🔴</span> <b>${t.name}</b></td><td class="c-orange">Her ayın ${t.gun}.</td><td class="c-red fw-700">${TL(t.rent)}</td><td>${canEdit()?`<button class="btn btn-xs btn-primary" onclick="openMod('pay-add','${b}:${t.id}')">💳 Gir</button>`:''} <button class="btn btn-xs btn-ghost" onclick="waMsg('${b}','${t.id}','${m}')">💬 WA</button></td></tr>`;
    }));

    let alerts='';
    const now=new Date();
    BK.forEach(b=>(DATA.tenants[b]||[]).filter(t=>t.active&&t.bit).forEach(t=>{
      const bit=new Date(t.bit); const days=Math.ceil((bit-now)/864e5);
      if(days>=0&&days<=60) alerts+=`<tr><td><b>${BL[b]}</b></td><td>${t.unit}</td><td>${t.name}</td><td>${t.bit}</td><td class="${days<=30?'c-red':'c-orange'} fw-700">${days} gün</td><td class="c-blue">${TL(t.rent)}</td></tr>`;
    }));

    const smart=(typeof renderSmartWidgets==='function')?renderSmartWidgets(m):'';
    return monthBar()+smart+`
      <div class="kpi-grid">
        <div class="kpi-card" style="--kpi-color:var(--blue-l)"><div class="kpi-icon">💰</div><div class="kpi-value">${TL(tRent)}</div><div class="kpi-label">Toplam Kira — ${m}</div></div>
        <div class="kpi-card" style="--kpi-color:var(--emerald-l)"><div class="kpi-icon">✅</div><div class="kpi-value">${TL(tPaid)}</div><div class="kpi-label">Tahsil Edilen</div><div class="card-sub c-green">${tRent>0?Math.round(tPaid/tRent*100):0}% tahsil</div></div>
        <div class="kpi-card" style="--kpi-color:var(--rose-l)"><div class="kpi-icon">❌</div><div class="kpi-value">${TL(tRent-tPaid)}</div><div class="kpi-label">Tahsil Edilmedi</div></div>
        <div class="kpi-card" style="--kpi-color:var(--amber-l)"><div class="kpi-icon">💸</div><div class="kpi-value">${TL(tExp)}</div><div class="kpi-label">Toplam Gider</div></div>
        <div class="kpi-card" style="--kpi-color:${net>=0?'var(--emerald-l)':'var(--rose-l)'}"><div class="kpi-icon">📈</div><div class="kpi-value">${TL(net)}</div><div class="kpi-label">Net Gelir</div></div>
      </div>
      <div class="sec-hdr">🏢 Bina Özeti — ${m}</div>
      <div class="table-card"><div class="table-scroller"><table><thead><tr><th>Bina</th><th>Kiracı</th><th>Kira</th><th>Tahsilat</th><th>Borçlu</th><th>Gider</th><th>Net</th><th></th></tr></thead><tbody>${brows}</tbody></table></div></div>
      ${overdue?`<div class="sec-hdr">⚠️ Gecikmiş Ödemeler</div><div class="table-card"><div class="table-scroller"><table><thead><tr><th>Bina</th><th>Daire</th><th>Kiracı</th><th>Ödeme Günü</th><th>Kira</th><th></th></tr></thead><tbody>${overdue}</tbody></table></div></div>`:''}
      ${alerts?`<div class="sec-hdr">📋 Kontrat Bitiş (60 gün)</div><div class="table-card"><div class="table-scroller"><table><thead><tr><th>Bina</th><th>Daire</th><th>Kiracı</th><th>Bitiş</th><th>Kalan</th><th>Kira</th></tr></thead><tbody>${alerts}</tbody></table></div></div>`:''}`;
  };

  // If app is already open on a blank dashboard, rerender it.
  setTimeout(()=>{ try{ if(document.getElementById('content')) render(); }catch(e){ console.error(e); } }, 200);
})();
