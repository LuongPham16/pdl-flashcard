# Hướng dẫn sử dụng PDL Flashcard

**PDL Flashcard** giúp bạn tạo và ôn tập flashcard ngay trong Obsidian theo phương pháp
lặp lại ngắt quãng. Plugin có thể nhờ AI đọc note để soạn thẻ nháp, hoặc bạn tự viết thẻ.

> Phiên bản **1.0.4**. Giao diện hỗ trợ tiếng Anh và tiếng Việt.

## 1. Cài đặt

1. Tải `main.js`, `manifest.json`, `styles.css` từ bản release.
2. Chép vào `<vault>/.obsidian/plugins/pdl-flashcard/`.
3. Mở **Settings → Community plugins** và bật **PDL Flashcard**.

## 2. Cấu hình lần đầu

Vào **Settings → PDL Flashcard**.

### Tab General

- **Language**: English hoặc Tiếng Việt.
- **Flashcard folder**: nơi lưu các note deck, mặc định `06 - Flashcards`.
- **Source folders**: các thư mục được phép đọc note nguồn.
- **Excluded folders**: thư mục bị loại, ví dụ `_agent`, template.
- **Cards per flashcard type**: số thẻ Q&A / MCQ / Cloze mặc định khi mở AI builder.
- **Create reverse cards by default**: bật sẵn thẻ 2 chiều.
- **Read aloud (TTS)**: chọn giọng và tốc độ đọc.

Chỉ note trong **Source folders** mới xuất hiện ở các ô chọn note/folder.

### Tab AI

- Chọn **Provider**: OpenAI, Gemini, DeepSeek, Claude hoặc Custom.
- Nhập **API key**.
- Chọn model; có thể bấm **Fetch models**.
- Có thể chỉnh prompt preset. Các biến hỗ trợ:
  `{basicCount}`, `{mcqCount}`, `{clozeCount}`.

## 3. Tạo flashcard bằng AI

### Từ một note

1. Mở note nguồn.
2. Chạy **PDL Flashcard: Create flashcards from active note** (hoặc tự gán phím tắt trong *Settings → Hotkeys*).
3. Trong **Flashcard Studio**:
   - chọn số thẻ Q&A / MCQ / Cloze;
   - chọn prompt;
   - bật/tắt thẻ 2 chiều;
   - bấm **Generate with AI**.
4. Sửa từng thẻ nháp nếu cần, rồi bấm **Save**.

### Từ đoạn bôi đen

1. Bôi đen đoạn text trong note.
2. Chuột phải → **Create AI flashcards from selection**.
3. Kiểm tra đoạn trích, số thẻ, prompt rồi Generate.

AI chỉ nhận đúng đoạn bôi đen, không đọc cả note.

### Từ cả folder

1. Mở **Flashcard Studio → Create decks from a folder**.
2. Chọn folder.
3. Chọn **Select all notes** hoặc tick từng note.
4. Chọn số thẻ/prompt rồi **Generate**.
5. Mỗi note được tạo deck riêng; note đã có deck sẽ được bổ sung.
6. Note lỗi được đánh dấu, các note còn lại vẫn chạy tiếp.

### Quy tắc tag của AI

- AI **chỉ được dùng lại các tag đã có** trên card của bạn.
- Tag mới do AI tự nghĩ ra sẽ bị bỏ.
- Nếu không khớp tag nào, card được lưu **không có tag**.
- Bạn vẫn có thể tự thêm tag mới bằng tay.

## 4. Tự viết thẻ

Trong **Flashcard Studio**, thêm thẻ và chọn loại:

- **Question and answer**: hỏi → đáp.
- **Multiple choice**: 4 lựa chọn.
- **Cloze**: dùng `{{c1::từ cần ẩn}}` hoặc `==từ cần ẩn==`.

Có thể chèn ảnh bằng nút **Image** cạnh ô Question / Answer / Explanation. Ảnh được chèn
thành block riêng, căn giữa và giới hạn chiều cao để không phá bố cục thẻ.

## 5. Ôn tập

Mở dashboard bằng icon brain trên ribbon hoặc command
**PDL Flashcard: Open learning dashboard**.

- **Quick Review**: thẻ đến hạn/mới.
- **Custom Study**: ôn theo deck, tag hoặc thẻ bị quên.
- **Again / Hard / Good / Easy**: tự đánh giá mức nhớ.
- **Ctrl/Cmd + Z** hoặc nút hoàn tác: hủy lần đánh giá vừa rồi.
- **Suspend**: ẩn thẻ khỏi mọi phiên.
- **Bury**: ẩn đến mai.
- **Leech**: thẻ quên nhiều lần tự bị suspend.

### Cloze

- Mỗi chỗ trống có một ô nhập.
- Bấm **Check answer** hoặc Enter để kiểm tra.
- Có thể bấm từng ô chữ gợi ý để mở một ký tự bất kỳ.
- Trước khi reveal, TTS đọc câu đã che; sau reveal mới đọc đáp án.

### Đọc to (TTS)

- Miễn phí, dùng giọng của hệ điều hành.
- Chọn giọng và tốc độ trong **Settings → General → Read aloud (TTS)**.
- Bấm **Refresh voices** sau khi cài gói giọng mới.
- Nếu máy chưa có giọng `vi-VN`, Obsidian có thể không đọc đúng tiếng Việt.
- Thẻ trộn Anh–Việt hiện dùng một giọng cho cả thẻ.

## 6. Dashboard và thống kê

- Thẻ đến hạn, hôm nay, đã thuộc, streak.
- Heatmap 26 tuần: bấm legend để đổi màu, bấm icon hình để đổi kiểu ô.
- Thư viện deck: phân trang, nhảy trực tiếp đến trang bất kỳ.
- **Statistics**: retention, phân bố điểm, tải theo deck, thẻ khó.
- **Manager**: tìm/lọc/sửa/suspend/xóa thẻ.

## 7. Import / Export

Mở **PDL Flashcard: Import or export flashcards**.

### Import

Hỗ trợ JSON hoặc text phân cách:

- Auto-detect
- Dấu phẩy `,`
- Dấu chấm phẩy `;`
- Tab
- Dấu cách
- Hai dấu hai chấm `::`
- Dấu gạch đứng `|`

Có thể:

- lưu thành deck riêng, hoặc
- chọn **note đích** để bổ sung vào deck của note đó.

Dialog hiện số thẻ nhận diện được trước khi bấm Import. Nếu format sai, chỉ báo lỗi khi
bạn bấm **Import Cards**.

### Import từ đoạn bôi đen

Bôi đen text → chuột phải → **Import selection as flashcards…**. Dialog mở với nội dung
và note đích điền sẵn; bạn sửa delimiter/nội dung rồi mới Import.

### Export

Xuất CSV hoặc JSON theo toàn bộ thư viện hoặc từng deck.

## 8. Dữ liệu và sao lưu

- Deck là note Markdown trong thư mục flashcard.
- Tiến trình học, cài đặt và API key nằm trong `data.json` của plugin.
- Plugin tự sao lưu `data.json` vào thư mục `backups` (giữ 30 bản gần nhất).
- `data.json` có thể chứa API key dạng plain text; hãy bảo vệ backup của vault.

## 9. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| AI báo 401 | Kiểm tra lại API key/provider |
| AI báo 429 | Hết quota/rate limit; chờ hoặc đổi provider |
| AI báo 503 | Provider quá tải; thử lại hoặc đổi model |
| Không thấy note/folder | Thêm folder vào **Source folders** |
| TTS không có tiếng Việt | Cài speech pack, mở lại Obsidian, bấm Refresh voices |
| Ảnh không hiện | Kiểm tra đường dẫn embed và file ảnh còn trong vault |
| Import 0 thẻ | Kiểm tra delimiter và preview trước khi Import |

## 10. Phím tắt và command chính

- Tự gán phím tắt trong *Settings → Hotkeys* cho lệnh tạo flashcard.
- `Ctrl/Cmd + Z` — hoàn tác lần đánh giá.
- `Space` — hiện đáp án / thao tác chính trong phiên ôn.
- Command Palette: gõ `PDL Flashcard` để xem toàn bộ lệnh.

## 11. Ghi chú

- Plugin chưa có trên community registry.
- Cần API key hợp lệ và quota còn hiệu lực để dùng AI.
- Chất lượng TTS phụ thuộc giọng hệ điều hành.
