# Hướng dẫn sử dụng PDL Flashcard

Plugin **PDL Flashcard** giúp bạn học tập và ghi nhớ kiến thức theo phương pháp Lặp lại ngắt quãng (Spaced Repetition) ngay trong Obsidian. 
Đặc biệt, plugin hỗ trợ dùng AI để tự động "đọc hiểu" ghi chú (notes) của bạn và sinh ra các bộ thẻ (flashcards) một cách nhanh chóng.

## 1. Tự động sinh Flashcard bằng AI
Để tạo flashcard từ một note:
1. Mở một note bất kỳ mà bạn muốn học.
2. Mở Command Palette (`Ctrl/Cmd + P`) và gõ: `PDL Flashcard: Create flashcards from active note`. Hoặc dùng phím tắt `Mod + Alt + K`.
3. Modal **Flashcard Studio** sẽ hiện ra:
   - Bạn có thể chỉnh sửa số lượng thẻ (Cơ bản, Trắc nghiệm, Điền khuyết).
   - Chọn loại Prompt: Default (Hiểu sâu), Technical (Lệnh/Code), Language (Ngôn ngữ).
   - Chọn **Thẻ 2 chiều** (Sinh ra thẻ Hỏi -> Đáp và thẻ Đáp -> Hỏi) nếu cần thiết.
   - Bấm **Generate with AI** và chờ AI phân tích nội dung.
   - Sau khi AI trả về kết quả, bạn có thể chỉnh sửa lại nội dung từng thẻ trước khi lưu thành bộ (Deck).

## 2. Tạo Flashcard AI từ đoạn bôi đen (chuột phải)
Khi bạn chỉ muốn học một đoạn nhỏ trong note (một mục, một bảng, một đoạn code) thay vì cả note:
1. Trong note, **bôi đen** đoạn text bạn muốn học.
2. **Bấm chuột phải** vào đoạn bôi đen và chọn **"Tạo flashcard AI từ đoạn bôi đen"**.
3. Hộp thoại hiện ra cho bạn xem lại đoạn trích, chọn số lượng thẻ (Q&A / MCQ / Cloze) và preset prompt. Dòng trạng thái cho biết note này sẽ **tạo deck mới** hay **bổ sung vào deck đã có**.
4. Bấm **Generate flashcards**: AI chỉ đọc đoạn bôi đen, sau đó các thẻ nháp hiện ra trong **Flashcard Studio** để bạn xem/sửa.
5. Bấm **Save to `06 - Flashcards`** (note chưa có flashcard) hoặc **Add to <tên deck>** (note đã có flashcard) để lưu.
   - Tạo deck mới: sinh note deck trong thư mục Flashcards, gắn với note nguồn.
   - Bổ sung: thẻ mới được thêm vào **đúng deck của note đó**, thẻ cũ và phần văn xuôi trong note deck được giữ nguyên.

Bạn cũng có thể dùng Command Palette: `PDL Flashcard: Generate flashcards from selected text` (lệnh chỉ hiện khi đang bôi đen text trong một note hợp lệ).

## 3. Các dạng Thẻ (Card Types)
- **Thẻ Cơ bản (Basic)**: Có câu hỏi mặt trước và câu trả lời mặt sau.
- **Thẻ Trắc nghiệm (Multiple Choice)**: Chọn 1 trong 4 đáp án.
- **Thẻ Điền khuyết (Cloze)**: Trong câu hỏi có những chỗ bị che đi (ví dụ: `{{c1::từ khoá}}` hoặc `==từ khoá==`). Nhiệm vụ của bạn là nhớ ra phần bị che.

## 4. Chế độ Học tập (Study Sessions)
Từ thanh bên trái (Ribbon), bấm vào biểu tượng `brain-circuit` để mở **Learning Dashboard**.
- **Quick Review**: Hệ thống sẽ tự nhặt các thẻ đến hạn ôn tập hoặc thẻ mới để bạn ôn ngay lập tức.
- **Custom Study**: Ôn tập tuỳ chỉnh. Bạn có thể chọn cụ thể Thư mục (Deck), Tag, hoặc trạng thái (Mới, Đang học, Đến hạn) để học tập trung.

**Trong lúc học:**
- Hiển thị mặt trước của thẻ. Bạn hãy thử tự trả lời trong đầu.
- Nhấn **Show Answer** (hoặc Spacebar) để xem mặt sau.
- Tự đánh giá mức độ nhớ của mình để hệ thống lên lịch lần ôn tiếp theo:
  - **Lại (Again)**: Quên hoàn toàn, thẻ sẽ được đưa lại vào cuối phiên (tối đa 2 lần) — giống Anki.
  - **Khó (Hard)**: Nhớ nhưng mất nhiều thời gian.
  - **Tốt (Good)**: Nhớ ở mức bình thường.
  - **Dễ (Easy)**: Quá dễ, lùi lịch ôn lại thật xa.
- **Ctrl/Cmd + Z** hoặc nút **↺** để hoàn tác lần đánh giá vừa rồi.
- Nút **⏸ (Suspend)** tạm dừng thẻ khỏi mọi phiên ôn; nút **👁 (Bury)** ẩn thẻ đến mai.
- Thẻ bị quên quá nhiều lần (mặc định 8) sẽ **tự động bị suspend** (leech) và nhắc bạn viết lại thẻ — chỉnh ngưỡng ở Settings → Review behaviour.

**Nội dung thẻ hỗ trợ Markdown đầy đủ:** ảnh `![[anh.png]]`, embed, công thức toán `$...$`, wikilink.

**Quản lý thẻ:** mở **Manage cards** để tìm/lọc toàn bộ thẻ, suspend hoặc bật lại từng thẻ, sửa hoặc xoá.

## 5. An toàn dữ liệu
Plugin sẽ lưu toàn bộ tiến trình học tập của bạn vào file `data.json`.
- Hệ thống sẽ **tự động sao lưu** file này định kỳ vào thư mục `backups` nằm trong thư mục cài đặt của plugin để tránh rủi ro mất dữ liệu học tập.
