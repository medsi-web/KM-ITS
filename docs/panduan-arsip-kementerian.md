# Panduan Unggah Dokumen Arsip untuk Kementerian

Panduan ini untuk staf kementerian yang mengunggah dokumen ke fitur **Knowledge/Arsip** di website KM ITS. Tidak perlu bisa coding.

## 1. Isi folder

Setiap dokumen terdiri dari **dua file**:

1. **File PDF** berisi dokumennya.
2. **File `.md`** berisi data dokumen (judul, kategori, tahun, dan lain-lain).

Aturan folder:

- Kedua file diletakkan **langsung** di folder Drive kementerian kalian.
- **Jangan pakai subfolder.** Sistem tidak membaca isi subfolder.
- Satu dokumen = satu file `.md`. Sepuluh dokumen = sepuluh PDF + sepuluh `.md`.

## 2. Mengambil ID file PDF

1. Unggah PDF ke folder kementerian.
2. Klik kanan PDF, pilih **Bagikan > Salin link**.
3. Link berbentuk `https://drive.google.com/file/d/<ID>/view?usp=sharing`.
4. Ambil bagian **di antara `/d/` dan `/view`**. Itulah ID-nya.

Contoh: dari `https://drive.google.com/file/d/1AbCdEf123_XyZ/view`, ID-nya `1AbCdEf123_XyZ`.

## 3. Membuat file `.md`

1. Salin template [`docs/templates/dokumen.md`](templates/dokumen.md).
2. Buka aplikasi teks biasa (Notepad, TextEdit mode teks biasa, atau VS Code). **Jangan pakai Google Docs atau Word.**
3. Tempel template, lalu isi datanya (lihat bagian 4).
4. Simpan dengan nama berakhiran `.md`, misalnya `laporan-tahunan-2026.md`.
   - Di Notepad, pilih "Save as type: **All files**" dan encoding **UTF-8**, agar tidak menjadi `.md.txt`.
5. Unggah file `.md` ke folder kementerian yang sama dengan PDF-nya.

## 4. Isi file `.md`

Contoh lengkap:

```yaml
---
schemaVersion: 1
driveFileId: 1AbCdEf123_XyZ
title: "Laporan Kegiatan: Kementerian Sosial 2026"
description: Ringkasan kegiatan dan hasil program selama satu tahun.
category: Laporan
year: 2026
authors:
  - Tim Dokumentasi Kementerian Sosial
  - Nama Penulis Kedua
---
```

| Kolom | Wajib? | Aturan |
|---|---|---|
| `schemaVersion` | Wajib | Selalu `1`. |
| `driveFileId` | Wajib | ID file PDF (bagian 2), bukan ID file `.md`. |
| `title` | Wajib | Maksimal 300 karakter. |
| `description` | Opsional | Maksimal 5000 karakter. |
| `category` | Opsional | Maksimal 100 karakter, misalnya Laporan, Kajian, Notulensi. |
| `year` | Opsional | 4 digit angka, minimal 1900. |
| `authors` | Opsional | Maksimal 30 nama, tiap nama maksimal 200 karakter. Satu nama per baris, diawali dua spasi lalu `- `. |

Hal penting:

- Baris pertama dan baris penutup harus tepat `---`.
- Jika judul memuat titik dua (`:`) atau tanda `#`, **apit dengan tanda kutip**: `title: "Notulensi: Rapat Kerja"`.
- **Jangan menambah kolom lain** (misalnya `notes` atau `catatan`). Dokumen akan ditolak.
- Kolom opsional boleh dihapus barisnya.
- Baris yang diawali `#` adalah catatan dan diabaikan. Jangan taruh catatan di antara nama-nama penulis.
- Teks di bawah `---` penutup tidak ditampilkan di website.

## 5. Pengaturan berbagi

1. Klik kanan **PDF > Bagikan**.
2. Di "Akses umum", pilih **Siapa saja yang memiliki link**, peran **Pengakses lihat (Viewer)**.
3. Klik **Selesai**.

PDF yang tidak dibagikan seperti ini **tidak akan tampil** di website.

**Folder kementerian jangan dibuat publik.** Cukup PDF-nya saja.

## 6. Mengedit file `.md`

Google Drive tidak bisa mengedit `.md` langsung. Caranya:

1. Klik kanan file `.md` > **Download**.
2. Edit di aplikasi teks biasa, lalu simpan.
3. Di Drive, klik kanan file `.md` yang lama > **Informasi file > Kelola versi (Manage versions)**.
4. Klik **Upload versi baru**, pilih file hasil edit.

Cara ini **menjaga file tetap sama**, jadi website menganggapnya dokumen yang sama.

Jika Drive bertanya saat unggah file bernama sama, pilih **Ganti file yang ada (Replace existing file)** untuk file `.md`.

**Jangan hapus lalu unggah ulang file `.md`.** File baru dianggap dokumen baru, dan dokumen lama hilang dari website.

## 7. Mengganti PDF dengan versi baru

1. Unggah PDF baru sebagai **file baru** di folder yang sama. Jika Drive bertanya, pilih **Simpan kedua file (Keep both)**.
2. Atur berbagi PDF baru (bagian 5).
3. Ambil ID PDF baru (bagian 2).
4. Edit file `.md` **yang sama** (bagian 6), ganti `driveFileId` dengan ID baru.
5. PDF lama boleh dihapus setelah dokumen baru tampil.

**Jangan pernah menimpa isi PDF lama** lewat "Kelola versi" atau "Ganti file yang ada". Sistem menolak PDF yang isinya berubah dengan ID yang sama, sehingga dokumen bisa gagal dibuka.

## 8. Menyembunyikan atau menghapus dokumen

- **Hapus file `.md`**: dokumen hilang dari website.
- Memindahkan atau menghapus PDF juga membuat dokumen hilang.
- Admin website juga bisa menyembunyikan dokumen tanpa mengubah folder. Hubungi admin jika perlu.

## 9. Berapa lama sampai tampil?

- Sistem memeriksa folder sekitar **setiap 5 menit**.
- Biasanya dokumen tampil atau berubah dalam beberapa menit, tetapi **tidak dijamin**.
- Perubahan pengaturan berbagi saja bisa butuh waktu lebih lama (hingga beberapa jam).
- Jika setelah 30 menit belum tampil, cek tabel kesalahan di bawah, lalu hubungi admin.

## 10. Kesalahan umum

| Kesalahan | Akibat di website |
|---|---|
| Baris `---` di awal atau akhir hilang | Dokumen tidak tampil |
| `driveFileId` salah, atau berisi ID file `.md` | Dokumen tidak tampil |
| PDF ada di folder lain atau di subfolder | Dokumen tidak tampil |
| PDF belum dibagikan "Siapa saja yang memiliki link" | Dokumen tidak tampil |
| Ada kolom tambahan, misalnya `notes` | Dokumen tidak tampil |
| Judul kosong, terlalu panjang, atau tahun bukan 4 digit | Dokumen tidak tampil |
| File tersimpan sebagai `.md.txt` | Tidak dibaca sama sekali |
| Isi PDF lama ditimpa versi baru | Perubahan ditolak, dokumen bisa gagal dibuka |

Penting: jika dokumen **sudah tampil** lalu file `.md`-nya diedit dan menjadi salah, dokumen itu **ikut disembunyikan** sampai kesalahannya diperbaiki. Setelah diperbaiki, dokumen tampil lagi.

Admin dapat melihat alasan penolakan di log sinkronisasi. Minta bantuan admin jika bingung.
