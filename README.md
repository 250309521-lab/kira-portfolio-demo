# Kira Takip Pro v5.1.6

Emlak Yönetim Sistemi — Istanbul

## Hızlı Başlangıç

```bash
npm install   # bağımlılıkları yükle
npm start     # uygulamayı başlat (development)
npm run build # Windows installer oluştur
```

## Varsayılan Kullanıcılar

| Kullanıcı | Rol | PIN |
|-----------|-----|-----|
| Malik (Sahip) | Admin | 1234 |
| Alper | Editor | 5678 |
| Hamid Bey | Viewer | 9999 |

## Supabase Bulut Sync Kurulumu

### 1. Supabase Projesi Oluştur
- https://supabase.com → New Project
- Projeyi oluşturun (bu proje zaten mevcut: xhyfbkhddcosapkhtoyb)

### 2. Tabloları Oluştur (SQL Editor)
- Supabase Dashboard → SQL Editor
- `supabase/schema.sql` dosyasını yapıştır → Run

### 3. API Bilgilerini Al
- Supabase Dashboard → Project Settings → API
- **Project URL**: `https://xhyfbkhddcosapkhtoyb.supabase.co`
- **anon / public key**: `eyJ...` ile başlayan key (publishable, güvenli)

### 4. Uygulamada Bağlan
- Araçlar → **Bulut Sync**
- "Supabase" sekmesinde URL ve Key girin
- **Bağlan** butonuna tıklayın
- **Push** → verileri buluta yükle
- **Pull** → buluttan indir

## Veri Konumları

```
%APPDATA%\kira-takip-pro\
  ktp-store.json     ← ayarlar, kullanıcılar
  app.log            ← uygulama logu
  backups\           ← otomatik yedekler
```

## Build (Windows .exe)

```bash
npm run build
# dist/KiraTakipPro-Setup-5.1.6.exe
```

## Değişiklikler v5.1.6

- Supabase cloud sync eklendi (gerçek bağlantı)
- Analytics sayfa layout düzeltildi (kartlar kesilmiyordu)
- smart-grid responsive iyileştirildi
- Month bar momentum scroll eklendi
- Tüm sidebar öğeleri çalışıyor

## v5.1.8 hotfix
- Fixed Supabase Cloud Sync validation so the Test and Connect buttons read the live Project URL and publishable/anon key fields correctly.
- Added clearer Supabase errors for invalid URL, invalid key, and missing `ktp_sync` schema.
- The app still uses local JSON storage first; Supabase sync can be enabled after running `supabase/schema.sql` in the Supabase SQL Editor.
