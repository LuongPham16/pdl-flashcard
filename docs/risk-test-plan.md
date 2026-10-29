# Risk test plan — import, selection, batch

Mục tiêu: chốt 22 rủi ro người dùng có thể gặp trước khi deploy.  
Trạng thái: **20 automated / 2 manual**; bộ test hiện tại **148/148 pass**.

| # | Rủi ro | Cách kiểm tra | Kỳ vọng | Trạng thái |
|---|---|---|---|---|
| 1 | CSV có dấu phẩy trong ngoặc kép bị tách sai | Import `"Question, with comma",Answer` | Giữ nguyên câu hỏi trong một field | ✅ automated |
| 2 | Tab nhưng field có dấu cách | Chọn Tab, nhập `Question with space\tAnswer with space` | Không cắt mất chữ | ✅ automated |
| 3 | Anki `::` không được nhận | Nhập `Q::A` với Auto-detect | Nhận delimiter `::` | ✅ automated |
| 4 | Dấu cách bị tách sai | Chọn Space, nhập `Alpha Beta` | Q=Alpha, A=Beta | ✅ automated |
| 5 | Auto-detect nhầm `;` hoặc `\|` | Nhập nhiều dòng `Q;A` và `Q\|A` | Chọn delimiter đúng theo đa số | ✅ automated |
| 6 | Format sai nhưng báo lỗi trước khi user sửa | Bôi đen text không có delimiter | Dialog vẫn mở, preview `0 cards`, không Notice | ✅ automated |
| 7 | Bấm Import khi vẫn sai format | Từ case 6, bấm Import Cards | Chỉ lúc này hiện cảnh báo; không tạo file | ✅ automated |
| 8 | Import vào note đã có deck bị tạo deck trùng | Import 1 card vào note đã có deck | Append vào deck cũ | ✅ automated |
| 9 | Import vào note chưa có deck | Import vào note trống | Tạo deck linked đúng `sourcePath` | ✅ automated |
| 10 | Đổi note đích sau khi xem preview | Chọn note A, sửa text, chọn note B, Import | Chỉ ghi vào B | ✅ automated |
| 11 | JSON bị ảnh hưởng bởi delimiter | Chọn Tab rồi dán JSON | JSON vẫn parse đúng | ✅ automated |
| 12 | Tên deck standalone trùng | Import 2 lần cùng tên | File thứ hai có suffix, không ghi đè | ✅ automated |
| 13 | Chuột phải mở sai dialog | Bôi đen `Q::A` → chuột phải → Import | Dialog mở, text + note đích điền sẵn | ✅ automated |
| 14 | Báo lỗi trước khi user kịp sửa selection | Bôi đen text sai format → Import | Không Notice trước khi bấm Import | ✅ automated |
| 15 | Sửa delimiter trong dialog rồi import | Text `Alpha Beta`, đổi delimiter sang Space | Import thành công | ✅ automated |
| 16 | Selection import vào note có deck | Bôi đen trong note đã có deck → Import | Append, không tạo deck mới | ✅ automated |
| 17 | Menu chuột phải xuất hiện trên file không hỗ trợ | Chuột phải trong PDF/canvas | Không có mục import flashcard | 🖐 manual |
| 18 | Batch chọn tất cả note | Chọn folder → Select all → Generate | Mỗi note có deck linked | ✅ automated |
| 19 | Batch chỉ chọn một số note | Bỏ tick vài note rồi Generate | Chỉ note được chọn có deck | ✅ automated |
| 20 | Batch trên note đã có deck | Chạy folder có note đã tạo deck | Append, không nhân đôi deck | ✅ automated |
| 21 | Một note lỗi AI/API key | Cho 1 note lỗi giữa danh sách | Note lỗi được đánh dấu, note sau vẫn chạy | ✅ automated |
| 22 | Upload ảnh trùng tên / mất trạng thái sau restart | Upload 2 ảnh cùng tên; đổi heatmap, pager, counts rồi mở lại Obsidian | Không ghi đè ảnh; cài đặt và pager giữ nguyên | 🖐 manual |

## Folder picker audit

- Studio, Batch, Import target và menu chuột phải dùng chung `isConfiguredSource`.
- Chỉ note trong `Settings → Source folders` mới xuất hiện.
- `excludedFolders` và thư mục flashcard/output luôn bị loại.
- Image picker vẫn liệt kê ảnh toàn vault vì ảnh không phải note nguồn.

## Lệnh chạy

```bash
npm run test:inproc
```

Kết quả hiện tại: **148 tests, 148 pass, 0 fail**.
