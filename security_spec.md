# Security Specification — QalbyLearn

## 1. Data Invariants
1. **Kepemilikan Survei**: Dokumen pada `/surveys/{surveyId}` hanya dapat dibaca, diubah, dan dihapus oleh pengguna Google terverifikasi yang `uid`-nya sama dengan `ownerUid`.
2. **Kepemilikan & Kode Sesi**: Dokumen pada `/sessions/{code}` harus menggunakan ID tepat 6 digit angka (`^[0-9]{6}$`), terhubung ke `surveyId` yang benar-benar ada dan dimiliki `request.auth.uid`, serta tidak dapat diubah lagi setelah berstatus terminal `selesai`.
3. **Akses Publik Terbatas pada Sesi**: Pengguna tanpa akun (Peserta dan Layar Presentasi) hanya dapat membaca satu dokumen `/sessions/{code}` (`get`) jika mengetahui kode 6 digit; kueri `list` pada `/sessions` hanya diizinkan untuk pemilik sesi.
4. **Peserta & Jawaban Hanya Tambah (Append-Only)**: Peserta hanya dapat melakukan `create` pada `/sessions/{code}/participants/{pid}` dan `/sessions/{code}/responses/{responseId}` ketika sesi berstatus `menunggu` atau `aktif`, dengan validasi tipe data, batas panjang string, dan server timestamp `request.time`. Peserta tidak dapat melakukan `update` atau `delete`.

## 2. The "Dirty Dozen" Payloads (Harus Ditolak dengan `PERMISSION_DENIED`)
1. **Shadow Field Injection (Survei)**: `POST /surveys/s1` dengan field ekstra `isAdmin: true`.
2. **Owner Spoofing (Survei)**: `POST /surveys/s1` dengan `ownerUid` milik pengguna lain.
3. **Unverified Email Write**: `POST /surveys/s1` dengan `request.auth.token.email_verified == false`.
4. **Oversized Title (DoS / Denial of Wallet)**: `POST /surveys/s1` dengan `title` sepanjang 500 karakter (> 160).
5. **Invalid Session Code Path**: `POST /sessions/abc123` (bukan 6 digit angka).
6. **Orphan Session Creation**: `POST /sessions/123456` dengan `surveyId` yang tidak ada di `/surveys`.
7. **Timestamp Forgery**: `POST /sessions/123456/responses/r1` dengan `createdAt` waktu masa lalu, bukan `request.time`.
8. **Terminal State Mutation**: `PATCH /sessions/123456` mengubah `status` dari `selesai` kembali ke `aktif`.
9. **Participant Update Tampering**: `PATCH /sessions/123456/participants/p1` oleh peserta mengubah `name`.
10. **Response Deletion by Participant**: `DELETE /sessions/123456/responses/r1` oleh peserta atau pengguna non-pemilik.
11. **Invalid Response Value Type**: `POST /sessions/123456/responses/r1` dengan `value: { nested: "object" }` atau `value: 99` (di luar rentang 1–5).
12. **Blanket Session Listing**: `LIST /sessions` tanpa filter atau oleh pengguna yang bukan pemilik.
