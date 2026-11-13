# Đặc tả Banqi Game

## Trạng thái và nguyên tắc

R0-01 dựng web tĩnh bằng HTML, CSS và JavaScript thuần. R0-02 bổ sung tọa độ a1–h4 và giao diện Sáng/Tối. **R2-01 đã chơi Offline hai người cùng máy.** Phương châm: **ĐƠN GIẢN NHƯNG HIỆU QUẢ**; logic trước, thẩm mỹ sau. Không framework, build system, dependency nặng hoặc kiến trúc nhiều lớp.

R1-01 bổ sung engine lật/đi/ăn thuần JavaScript và unit test, tách khỏi UI. R1-02 bổ sung thắng/thua và hòa tự động theo quy ước sản phẩm. R2-01 nối engine vào trang bằng ES module, giữ tọa độ/hướng/theme của R0-02. R2-03A thêm trường tróc, giữ bốn API/action/event. R2-03B nối cảnh báo/lỗi/kết quả vào UI. **R2-03C bổ sung giai đoạn xét lặp mới sau khi đoạn đuổi từng hoãn hòa chấm dứt**, giữ luật đi/ăn, 7/2, ngoại lệ và 60 ply; hợp đồng trong [RULES.md](RULES.md).

Nguồn yêu cầu: các prompt R0-01 đến R2-03C trong `prompts/`, gần nhất `prompts/R2-03C-ra-soat-hoa-sau-ngat-truong-troc.md`. Project Owner quyết định sản phẩm; ChatGPT phụ trách đặc tả/prompt/QA; Codex triển khai trong workspace `banqi-game`. Các quyết định dưới đây không đồng nghĩa với tính năng đã triển khai; trạng thái ghi rõ theo từng mốc.

## Quyết định sản phẩm đã chốt

### Trò chơi và luật nền

- Banqi (cờ tướng lật / Chinese Dark Chess), theo luật Đài Loan phổ biến. Bàn 32 ô: ngang 8 cột × 4 hàng hoặc dọc 4 cột × 8 hàng.
- Đầu ván xáo và úp cả 32 quân. Mỗi màu gồm 1 Tướng, 2 Sĩ, 2 Tượng, 2 Xe, 2 Mã, 2 Pháo, 5 Tốt.
- Ngẫu nhiên chọn người lật trước. Màu của quân lật đầu xác định màu người đi trước.
- Quân đi một ô trống theo chiều ngang/dọc, không đi chéo.
- Pháo đi một ô trống; chỉ ăn trên cùng hàng/cột khi có đúng một quân làm ngòi, không ăn kiểu liền kề. Ngòi có thể là quân úp. Quân úp không bị ăn.
- Mã ăn được Pháo theo thứ bậc Banqi Đài Loan thông dụng. Tốt ăn được Tướng; Tướng không ăn được Tốt.
- Luật lật/đi/ăn đã được đối chiếu và có kiểm thử trong R1-01; kết thúc ván và hòa tự động có trong R1-02, theo `docs/RULES.md`. R2-01 đã nối gameplay Offline; chưa có các chức năng Online.

### Lộ trình và giới hạn sản phẩm

Offline hai người → Online hai người → một Bot mạnh duy nhất. Không Elo, matchmaking, tài khoản bắt buộc, bảng xếp hạng, chat hoặc thương mại.

Online dự kiến dùng Supabase riêng + GitHub Pages, mã phòng đơn giản, đồng hồ gợi ý 10+0 và 15+10, cầu hòa, chịu thua và kết thúc ván. Danh tính quân chưa lật phải giữ ở backend, không gửi về trình duyệt trước khi lật; che bằng CSS không bảo vệ bí mật.

AI chỉ nhận thông tin công khai: quân đã lật/đã ăn và thống kê xác suất; không biết trước danh tính quân úp. Chỉ một độ khó, mục tiêu mạnh nhất có thể nhưng công bằng.

### Thắng/thua và quy ước hòa đã chốt — R1-02

- Sau hành động hợp lệ, thắng nếu đối phương hết quân (tính cả quân úp) hoặc người tiếp theo hết mọi hành động hợp lệ. Mất Tướng không tự thua; còn ô úp để lật thì không thua vì hết nước. Không hòa stalemate/thiếu lực lượng.
- Hòa tự động ở lần xuất hiện thứ ba của cùng thế cờ công khai, cùng bên đến lượt và cùng ánh xạ màu; không cần các lần xuất hiện liên tiếp.
- Hoặc đúng 60 nửa-lượt liên tục chỉ đi vào ô trống. Lật/ăn reset 0; nước sai không tăng đếm. Một hành động hợp lệ là một ply, không phải lượt đầy đủ.
- Ưu tiên: thắng hết quân → thắng hết hành động → hòa lặp ba lần → hòa 60 ply.

Đây là quy ước sản phẩm chủ động lựa chọn, không khẳng định là bộ luật quốc tế duy nhất. Không áp ngoại lệ đuổi quân/chase. Nguồn tham khảo và khác biệt với mốc 40 trong PDF cũ được ghi ở `docs/RULES.md`.

### Giao diện và tài nguyên

- Khi có gameplay, quân tạm dùng ký tự Unicode Hán trong vòng tròn CSS; tác giả thay bằng SVG sau. Riêng R0 chỉ dùng `?` cho ô úp, không tạo danh tính quân.
- Chuyển ngang/dọc trong khi chơi phải giữ nguyên vị trí logic và không reset ván. R0 chứng minh ánh xạ bằng các placeholder có ID ổn định, chưa có ván để reset.
- Chữ và quân luôn thẳng; không dùng CSS transform xoay bàn/quân.
- Âm thanh và animation làm sau khi gameplay ổn định.
- Có thể tham khảo ý tưởng từ iChess của cùng tác giả; không sửa iChess, không copy toàn bộ engine hoặc phụ thuộc vào project đó. R0 không cần truy cập iChess.

## Phần đã triển khai trong R0-01

- `index.html`: giao diện tiếng Việt, viewport responsive, mở trực tiếp qua `file://` không cần server/build.
- `style.css`: bàn co giãn trên PC/điện thoại, quân úp tròn, nút chọn hướng và chỉ báo trạng thái rõ ràng.
- `js/app.js`: tạo đúng 32 placeholder một lần; đổi vị trí hiển thị của chính các phần tử đó khi bấm Ngang/Dọc. Không xử lý bấm quân, xáo quân, lượt đi, màu người chơi hoặc trạng thái ván.
- `assets/pieces/red/` và `assets/pieces/black/`: thư mục trống có `.gitkeep` cho SVG về sau.
- `tests/mapping.test.cjs`: kiểm thử ánh xạ bằng công cụ tích hợp của Node, không cài dependency. Không cần Node để chạy trang.
- README hướng dẫn mở trang và kiểm tra thủ công; `.gitignore` bỏ qua dữ liệu môi trường, mật khẩu và dữ liệu Supabase local nhạy cảm. Giữ nguyên `prompts/`.

## Phần bổ sung trong R0-02

- Thay nhãn debug dưới quân bằng trục tọa độ ngoài mép bàn. Mỗi ô có `title`, `aria-label` và nhận focus bàn phím để truy cập tọa độ; nội dung ô chỉ còn placeholder `?`.
- Hai nút Sáng/Tối có `aria-pressed` và dấu ✓ cho lựa chọn hiện tại; nút hướng bàn cũng có dấu ✓. Focus rõ ở cả hai theme, chiều cao nút tối thiểu 44px.
- Biến CSS quản lý toàn bộ màu nền/chữ/nút/viền/bàn/ô/quân/trục/focus. Dark dùng nền trầm, không dùng nền trắng hoặc đen tuyệt đối trên diện rộng. Không thêm animation hoặc hiệu ứng chuyển màu.
- Giữ nguyên ID/phần tử/tọa độ logic của 32 ô qua mọi lần đổi hướng và theme. Không thêm trạng thái ván, gameplay hoặc hạ tầng.

### Hợp đồng tọa độ hiện tại (R0-02)

Tọa độ logic luôn là `(x, y)` trên bàn 8×4, `x = 0..7` ứng với a–h, `y = 0..3` ứng với 1–4. `(0,0)` là a1, `(7,3)` là h4. ID phần tử vẫn là `cell-${y * 8 + x}`, đồng thời giữ nguyên `data-x`, `data-y`. R0-02 thay quy ước hiển thị của R0-01 theo bảng dưới; hàng hiển thị tăng từ trên xuống.

| Hướng | Logic → hiển thị `(u, v)` | Hiển thị → logic `(x, y)` |
| --- | --- | --- |
| Ngang 8×4 | `(x, 3 - y)` | `(u, 3 - v)` |
| Dọc 4×8 | `(y, x)` | `(v, u)` |

Phép dọc tương đương xoay vị trí 90° theo kim đồng hồ, là song ánh trên đủ 32 ô và bảo toàn quan hệ kề ngang/dọc. CSS Grid nhận cột `u + 1`, hàng `v + 1` cho từng ô; không chỉ thay số cột rồi dàn lại thứ tự DOM. Quay lại ngang phục hồi chính xác vị trí ban đầu. Không xoay nội dung quân.

| Hướng | Góc trên trái / phải | Góc dưới trái / phải | Trục trái | Trục dưới |
| --- | --- | --- | --- | --- |
| Ngang | a4 / h4 | a1 / h1 | 4, 3, 2, 1 | a, b, c, d, e, f, g, h |
| Dọc | a1 / a4 | h1 / h4 | a, b, c, d, e, f, g, h | 1, 2, 3, 4 |

Trục được dựng từ phép ánh xạ nghịch đảo, nằm ngoài khung bàn, căn giữa theo hàng/cột tương ứng. Danh tính ô không phụ thuộc theme hoặc hình quân: khi thay nội dung `.piece` bằng SVG trong `assets/pieces/red/`, `assets/pieces/black/` hoặc `assets/pieces/back.svg`, không cần đổi ánh xạ tọa độ hay engine. R0-02 chưa tạo SVG.

### Hợp đồng theme

1. `js/app.js` là classic script chạy ở đầu `<head>`, trước CSS và nội dung chính. Đọc `localStorage['banqi-theme']`; chỉ chấp nhận `light` hoặc `dark`. Giá trị không hợp lệ hoặc storage bị chặn được bỏ qua.
2. Khi không có lựa chọn thủ công hợp lệ, dùng `prefers-color-scheme`, mặc định sáng nếu không ưu tiên tối; theo dõi thay đổi của hệ thống.
3. Áp dụng `data-theme` lên `<html>` ngay; sau khi DOM sẵn sàng mới dựng bàn và gắn sự kiện nút. Không dựng lại bàn khi đổi theme.
4. Chọn Sáng/Tối cập nhật theme, trạng thái nút và lưu lựa chọn. Nếu ghi storage thất bại, lựa chọn vẫn giữ trong bộ nhớ cho lần mở hiện tại; không phát sinh lỗi làm hỏng giao diện. Khi đã chọn thủ công, hệ thống không ghi đè lựa chọn này.
5. Khi JavaScript không chạy, CSS media query vẫn chọn bảng màu hệ thống và có thông báo bật JavaScript; bản khung cần JavaScript để tạo 32 ô/chuyển hướng.
6. Theme chỉ thay màu và `aria-pressed`, không đổi ô, dữ liệu, hướng bàn, focus hoặc vị trí cuộn theo chủ ý. Không bổ sung giao diện ba chế độ.

### Kiểm chứng R0-02

- Giữ 7 kiểm tra ánh xạ R0-01, cập nhật kỳ vọng theo quy ước hiển thị mới; thêm 3 kiểm tra nhãn/góc/phép xoay (10 test).
- 26 kịch bản Chrome qua `file://`: 16 tổ hợp tại 320×568, 390×844, 768×1024, 1280×800 với cả hai hướng và hai theme; hệ thống/lưu trữ/giá trị không hợp lệ/storage bị chặn; 100 vòng đổi hướng/theme; bàn phím và cây accessibility; chuột/cảm ứng giả lập; tương phản; tắt JavaScript; lỗi console/tài nguyên.
- Đo tương phản chữ tối thiểu 4.5:1, focus tối thiểu 3:1 với nền trang/ô; kiểm tra nhãn trục không chồng quân, đúng vị trí và không tràn ngang.
- `tests/browser.test.cjs` dùng Chrome có sẵn, không cài dependency. Ảnh/báo cáo/profile là dữ liệu kiểm thử local ở `.local-qa/r0-02/`, không đưa vào Git. Xem README để chạy lại.
- Kiểm tra trong Chrome headless và đọc ảnh chụp không thay thế thử nghiệm thủ công trên điện thoại thật hay nghe trình đọc màn hình thực tế.

## Phần bổ sung trong R1-01

- `js/engine.mjs`: ES module độc lập, không dependency/DOM. `createGame` tạo private state với đủ 32 quân úp, Fisher–Yates và lựa chọn người đầu; có thể truyền random/người đầu để tái lập test.
- `getPublicState`: tạo snapshot mới theo danh sách trường cho phép; ô úp chỉ có `occupied`/`faceDown`, không lộ màu/loại/ID/seed hoặc nested metadata. Lượt, màu người chơi và quân đã ăn là thông tin công khai.
- `getLegalActions`: chỉ dùng public state để sinh `flip`/`move`. Ngoài lượt trả danh sách rỗng; nước đầu bắt buộc lật. Tọa độ engine cố định a1–h4, không phụ thuộc hướng/theme.
- `applyAction`: kiểm tra action bằng thông tin từ private state tin cậy, không mutate đầu vào. Thành công trả private state mới + public event; lỗi xác định không kèm state hoặc bí mật. Mỗi lần thành công chuyển lượt đúng một lần.
- Đã code lật/phân màu, đi một ô ngang/dọc, ăn theo cấp và ngoại lệ Tốt/Tướng, Mã/Pháo; Pháo chỉ ăn qua đúng một ngòi, không ăn kề hoặc ăn quân úp. Không pass/chuỗi ăn.
- `tests/engine.test.cjs`: unit test luật và ranh giới dữ liệu, dùng fixture riêng, không API cheat. `docs/RULES.md` ghi nguồn và hợp đồng schema/API/lỗi, cùng lệnh chạy toàn bộ test.
- Offline không bảo vệ private state khỏi DevTools; Online tương lai phải giữ private state ở backend. UI/AI tương lai chỉ tiêu thụ public snapshot/event. Không gửi nguyên `result.state` cho bên chỉ được biết thông tin công khai.
- Giữ nguyên `index.html`, `style.css`, `js/app.js` và các test R0; chưa kết nối engine vào UI. Không backend, migration, package, đồng hồ hoặc Bot.

## Phần bổ sung trong R1-02

- Giữ bốn API `createGame`, `getPublicState`, `getLegalActions`, `applyAction`; giữ action/event R1-01 và nguyên tắc không mutate đầu vào. Không thêm dependency hoặc engine song song.
- State thêm `status: playing|finished`, `result: null|{outcome, winner, reason}`, `noProgressPly` và bảng tần suất `positionCounts` nội bộ. Public chỉ nhận status, bản sao result, số ply và `repetitionCount` của vị trí hiện tại; không nhận bảng lịch sử/khóa hoặc danh tính quân úp.
- Khóa JSON chuẩn tắc chứa 32 ô logic (trống/úp/màu và loại đã lật), người đến lượt và ánh xạ màu. Bỏ qua thông tin bí mật, RNG, hướng/theme, thời gian, counter, result và thứ tự quân đã ăn. Vị trí đầu tính một lần; mỗi hành động hợp lệ ghi vị trí sau chuyển lượt một lần.
- Kết quả theo thứ tự ưu tiên ở trên; `reason` gồm `all_pieces_captured`, `no_legal_actions`, `threefold_repetition`, `no_progress_60`. Ván finished không còn legal action; mọi `applyAction` trả `GAME_OVER`, không đổi trạng thái hoặc phát thêm event.
- State R1-01 thiếu metadata được xem là đang chơi, bộ đếm 0 và vị trí hiện tại xuất hiện một lần; không khôi phục quá khứ chưa lưu. Không có API nhập/chỉnh ván hoặc cheat UI.
- Giữ 102 test luật R1-01, chỉ cập nhật assertion schema và kỳ vọng trạng thái phù hợp phần mở rộng. `tests/endgame.test.cjs` kiểm tra các kết quả, biên 59/60, lặp không liên tiếp, khóa công khai, ưu tiên, tính bất biến và khóa ván sau kết thúc. Fixture không đặt trước kết quả.
- Giữ nguyên UI R0-02 và test R0; chưa nối gameplay, không Online/Bot/đồng hồ/xin hòa/chịu thua, không lưu replay hay lịch sử nước đi.

## Phần bổ sung trong R2-01

- `js/offline.mjs` import đúng bốn API engine. Private state thuộc closure trong module; không gắn lên `window`, không stringify/log hoặc đưa vào DOM. Chỉ public snapshot/actions/event được dùng để chọn/hiển thị. Engine và toàn bộ luật R1-02 giữ nguyên.
- Ván mới xáo đủ 32 quân, ngẫu nhiên người đầu, chưa phân màu. Lật đầu phân màu theo engine; lật sau vẫn kết thúc một lượt dù mở quân đối phương. UI ghi Người 1/2 và Đỏ/Đen sau khi phân màu.
- Click/tap/Enter/Space trên nút ô để lật, chọn, đi hoặc ăn. Chọn lại để bỏ, chọn quân mình khác để đổi; có thể lật khi đang chọn. Đích đi có dấu chấm, đích ăn có viền nét đứt; focus bàn phím vẫn rõ trên đích ăn. Nước sai chỉ thay một phản hồi ngắn, không đổi state/lượt hoặc spam thông báo.
- Render kết quả thắng/hòa và lý do từ `result`, khóa input khi `finished`. Ván mới hỏi confirm khi bỏ ván đang chơi đã có nước; hủy giữ nguyên, đồng ý khởi tạo bằng `createGame`. Không save/replay, undo, xin hòa/chịu thua hay đồng hồ.
- 32 ô là native button với ID/data-x/data-y cũ; mỗi ô giữ một `.piece`. Quân úp chỉ có dấu `?` và nhãn `Quân úp tại a1`, không có màu/loại bí mật trong DOM/attribute. Đỏ dùng `帥 仕 相 俥 傌 炮 兵` với viền kép; Đen dùng `將 士 象 車 馬 砲 卒` với viền đơn, theo thứ tự Tướng/Sĩ/Tượng/Xe/Mã/Pháo/Tốt.
- Grid của nút ô có cột `minmax(0, 1fr)` để mặt quân không co theo độ rộng ký tự; mặt quân rộng 85%, tỉ lệ 1:1. Chữ ở hướng Dọc có kích thước phù hợp ô lớn. Bảng màu giữ nền R0-02 và thêm màu quân/đích đi cho Sáng/Tối, không animation/SVG.
- Đổi hướng/theme giữ quân, lượt, kết quả và lựa chọn đúng tọa độ, không gọi engine. Hợp đồng theme R0-02 và áp dụng sớm trước body vẫn giữ; chỉ theme được lưu localStorage. Tải lại trang tạo ván mới.
- `index.html` nạp controller bằng `type="module"`; mở qua Live Server/HTTP theo README, không hỗ trợ double-click `file://`. Classic `app.js` đăng ký dựng bàn trước controller, đồng thời giữ các hàm ánh xạ cho test Node.
- Test browser chuyển sang HTTP server chỉ có route allowlist. Fixture hiếm chỉ thay lần khởi tạo đầu trong server của test, dùng engine thật cho mọi nước và kết quả; production không có API nạp state/debug/cheat. Ván mới tiếp theo trong test vẫn gọi `createGame` thật.
- Giữ 175 test hồi quy; cập nhật test UI cũ từ placeholder sang nhãn/nút quân úp và HTTP. Kỳ vọng “click ô không làm gì” được thay bằng các ca lật đúng một quân ở suite gameplay. Thêm 38 test tính test cha: gameplay, bốn kết thúc thật, ván đầy đủ 83 hành động, confirm, keyboard/chuột/touch, DOM công khai, 16 tổ hợp viewport/theme/hướng, độ tròn/kích thước/tương phản. Tổng 213 test; lệnh và giới hạn kiểm tra ở README.
- Checkpoint R0–R1 là `663b03b374c411b1aa5307a122adffcb0e37ccde`, 15 file nguồn/tài liệu/test và `.gitignore`; không có secret, prompt bị ignore hoặc QA artifact. R2-01 nằm trên working tree, không commit thêm/push/deploy. Không sửa `.gitignore`, `prompts/`, engine hoặc test luật R1 trong R2-01.

Các phần R0/R1/R2-01 phía trên mô tả từng mốc lịch sử; engine hiện ở R2-03C, UI giữ R2-03B. Offline vẫn không bảo vệ bộ nhớ khỏi DevTools. Chưa kiểm tra điện thoại thật, Safari/Firefox hoặc trình đọc màn hình thật; Chrome PC/mobile giả lập và cây accessibility được kiểm tra tự động, ảnh chụp được xem lại tại R2-03B.

## R2-02 — rà soát luật, chưa đổi runtime

**Tại mốc R2-02, trường tróc chờ duyệt và chưa triển khai; ba quyết định sau đó đã được chốt ở R2-03A.** Xem [CHASE_RULE_DESIGN.md](CHASE_RULE_DESIGN.md) để đối chiếu Hsu 2019, Nam Đầu 2026 và Mistboard, ca engine cũ hòa sau 4 lần đuổi, định nghĩa cặp quân, cảnh báo trước vi phạm, ưu tiên phân xử và ma trận test. Không mặc định quy ước tự động hóa là điều lệ nguyên văn hoặc luật quốc tế.

Tại mốc R2-02, chạy lại **213/213 test PASS** và tạo checkpoint local R2-01 `d0509c3f0acd7549872a55c97daf0a23b343f850` theo allowlist 10 file. Các ghi chú “R2-01 chưa commit” phía trên mô tả lúc kết thúc R2-01; checkpoint R0–R1 `663b03b` vẫn giữ nguyên. R2-02 chỉ sửa tài liệu, không sửa engine/gameplay/test và không push/deploy. Ba quyết định về xử lỗi, ngoại lệ quân không thoát được và tương tác hòa được duyệt trong prompt R2-03A.

## R2-03A — engine trường tróc, chưa nối UI mới tại mốc đó

- Thực thi house adjudication dựa trên Nam Đầu 2026: cùng A đi yên dọa ăn hợp lệ cùng B, lần 7 một lỗi/action; lỗi đầu giữ nước/chuyển lượt, reset count giữ cặp/start; lỗi thứ hai thua. ID cấp theo thứ tự lật công khai, phân biệt hai quân cùng loại và đi theo quân qua di chuyển.
- Ngoại lệ bảo thủ chỉ khi toàn bàn mở và không có một phản hồi cơ bản nào cứu B, kể cả quân khác ăn A hoặc đổi ngòi Pháo. Dùng luật ăn chung, không soi quân úp/solver/đệ quy `applyAction`.
- Ưu tiên lỗi 2 → hết quân → hết hành động cơ bản → lặp 3 → 60. Hoãn lặp chỉ khi đúng một bên đuổi cùng cặp suốt cửa sổ ba lần xuất hiện; hold 60 cố định người/cặp, chỉ thu hẹp, mất hết cặp bằng nước yên thì hòa ngay. Ăn/lật reset quiet/runs/hold, giữ lỗi.
- Public có `visibleId` trên quân đã mở và `chase: {faults, runs, drawDeferred, warnings}`. Warning gắn action cụ thể, người chịu lỗi, `nextFault` và `losesGame`, dùng cùng phân tích với xử nước. Không lộ bảng lịch sử hay ID ô úp. Legacy chỉ khởi tạo lịch sử chase biết được tại trạng thái hiện có, không bịa lại quá khứ.
- C1 chạy đủ action thật: ply 8 không hòa, ply 13 lỗi 1 giữ nước/startPly, ply 27 Đỏ thua; warning có trước hai nước lỗi. Bộ test mới đối chiếu đầy đủ ở cuối [CHASE_RULE_DESIGN.md](CHASE_RULE_DESIGN.md).
- Không đổi UI R2-01 hoặc suite browser/gameplay. UI chưa hiển thị warning/lỗi và chưa ánh xạ reason mới `chase_technical_fouls`; R2-03B cần bổ sung lời giải thích kết quả. Không stage/commit/push/deploy; giữ checkpoint và tài liệu R2-02 chưa commit.

## R2-03B — cảnh báo và kết quả trường tróc trên UI Offline

- Trước sửa UI: baseline **265/265 PASS**; checkpoint local `8edc566` (`feat: checkpoint chase engine R2-03A`) gồm đúng `docs/RULES.md`, `docs/SPEC.md`, `docs/CHASE_RULE_DESIGN.md`, `js/engine.mjs`, `tests/engine.test.cjs`, `tests/endgame.test.cjs`, `tests/chase.test.cjs`. Stage allowlist, kiểm tra tên file/whitespace; không prompt/secret/QA artifact. R2-03B chưa commit/push/deploy.
- `js/offline.mjs` chỉ render `chase.faults/runs/drawDeferred/warnings` công khai. Không đếm đuổi hoặc xử luật riêng; không đổi engine, schema, bốn export hoặc unit test. Ngưỡng 5/6–6/6 được đọc từ run để nhắc; hậu quả của từng action lấy từ `nextFault/losesGame`.
- Vùng `#chase-status` cạnh lượt dùng `role=status`, `aria-live=polite`, `aria-atomic=true`, chỉ ghi lại khi nội dung đổi. Nêu lỗi đầu và ván tiếp tục; hoãn lặp/60 nêu người/cặp liên quan. `say()` báo hành động riêng, không ghi đè cảnh báo; theme/hướng không phát lại nội dung không đổi.
- Khi chưa chọn, liệt kê mọi warning của người đến lượt; khi chọn, lọc đúng `action.from`. Đích có dấu !/viền, tên truy cập chứa tọa độ nước và hậu quả, `aria-describedby` liên kết vùng cảnh báo. Đổi/bỏ chọn dọn dấu cũ. Không chặn nước lỗi, không modal xác nhận mới, giữ focus và nút Ván mới.
- `chase_technical_fouls` hiển thị cả người/màu thắng và thua do hai lỗi trường tróc (2/2), không `undefined`. Khi finished khóa bàn như trước; ván mới dùng engine reset và xóa cảnh báo cũ. Giữ Unicode, Ngang/Dọc, Sáng/Tối; không SVG/Online/Bot.
- Thêm **8 test Chrome UI**, giữ 265 nền: tổng **273/273 PASS**. C1 thực hiện đủ 27 ply qua UI thật: 8 chưa hòa, chuột gây lỗi 1 tại 13, touch gây lỗi 2 tại 27; test riêng Tab/Enter/Space kiểm tra cảnh báo trước đích và focus ở cả theme. Không đặt trước kết quả.
- Test đổi/bỏ chọn, hai đích warning, invalid, nước không bị cảnh báo, ván mới hủy/đồng ý, hoãn 60 và reset do lật; giữ hai ca hòa thông thường. Hoán đổi quân úp giữ cùng DOM/attributes/label/warning/event, không console log hay state trên window.
- Warning lỗi thứ hai và cả hai hoãn hòa được kiểm tra ở **320×568, 390×844, 768×1024, 1280×800 × hai theme × hai hướng**, đo overflow, độ tròn/kích thước, tọa độ, focus, chữ/dấu ! và tương phản ≥4.5. Có xem ảnh PC/mobile giả lập. Chưa kiểm tra điện thoại thật/Safari/Firefox/trình đọc màn hình thật.
- Helper Chrome tạo thư mục `run-*` riêng để không ghi đè ảnh/report/profile QA cũ; HTTP fixture và production không có API cheat mới. Lệnh test và kiểm tra cú pháp/whitespace ở README.

## R2-03C — rà soát hòa sau khi ngắt rồi tiếp tục truy đuổi

- Baseline **273/273 PASS**, giữ cả bảy file R2-03B đang dirty, không checkpoint/commit mới. HEAD `8edc566`, nhánh main ahead 3; không stage/push/deploy hoặc truy cập secret.
- Fixture suy luận tương đương: Tượng Đỏ b1, Sĩ Đỏ g1, Mã Đen b3, Sĩ Đen a4; chạy 21 nước hợp lệ, bảo toàn đủ cơ cấu quân với captured. Không có biên bản nên không khẳng định tái hiện đúng ván người dùng. Trace từng ply ở [CHASE_RULE_DESIGN.md](CHASE_RULE_DESIGN.md), phần R2-03C.
- Nguyên nhân: C2 cũ giữ tần suất cả ván. Sau đoạn hoãn hòa ply 16–18, Sĩ ngắt run ở 19; Tượng đuổi lại ở 21 với count 1/startPly 21. Thế sau 21 trùng 1 và 5; run mới không liên tục qua cửa sổ cũ nên hòa. Đây là hành vi đúng đặc tả cũ, cần quy ước đủ điều kiện mới.
- Sửa tối thiểu: lưu cặp từng thực sự hoãn lặp trong `repetitionChase`; khi tất cả cặp đó chấm dứt thì đặt `repetitionEpochStart` tại ply vừa đi. Chỉ xét ba lần từ mốc ấy, vị trí sau nước ngắt được tính lần đầu. Không tạo mốc mới từ đe dọa thoáng qua chưa từng hoãn; không reset khi còn cặp căn cứ khác hoặc chỉ có nước chạy/lỗi đầu.
- `repetitionCount` vẫn là tần suất thật; public thêm `drawRepetitionCount` 0–3 cho điều kiện hòa hiện tại. Không xóa bảng tần suất/ba mốc; không reset quiet ply, fault hoặc hold 60. Không sửa UI/test UI: controller đã đọc `drawDeferred/result`, không tự tính hòa từ tần suất.
- **290/290 PASS = 273 hồi quy + 17 unit test mới**, không fail/skip; 217 Node và 73 Chrome tính cả hai test cha. Fixture 21 nay vẫn chơi (`repetitionCount=3`, `drawRepetitionCount=1`); vòng chờ ba lần mới ở 19/23/27 vẫn hòa. C1 giữ 8/13/27. Lặp đuổi–ngắt 60 nước thật vẫn hòa 60; hold thật tại 60 ngắt/đổi A/B ở 61 vẫn hòa, còn tiếp tục thì lỗi 1 tại 61 và lỗi 2 tại 75.
- Test mới còn bao phủ giữ lỗi qua phase, nhiều cặp, ăn/lật/invalid, clone/JSON, công bằng hidden identity/getter, legacy đang hoãn, game over và Ván mới. Chỉ bổ sung ba assertion schema và hai trường cần xóa trong fixture legacy; không đổi kỳ vọng thắng/hòa của 273 test cũ. Chrome HTTP PC/Mobile, hai theme/hướng, chuột/touch/bàn phím vẫn PASS.
- Nghiệm thu tiếp tục ngày 14/11/2026: trạng thái tiếp nhận 287/287 PASS; thêm ba ca đối xứng người/màu, hai bên cùng đuổi sau mốc mới và cặp hoãn đã mất rồi trở lại. Không cần sửa engine thêm. `node --check` đủ 11 file và `git diff --check` PASS. Git giữ 13 modified/18 untracked, không staged; lượt tiếp tục chỉ đổi chase test và hai tài liệu này/CHASE_RULE_DESIGN. Biên bản cuối, log và phạm vi file chi tiết ở [CHASE_RULE_DESIGN.md](CHASE_RULE_DESIGN.md#nghiệm-thu-lượt-tiếp-tục-ngày-14112026--pass).
- Giới hạn: không bịa mốc quá khứ cho state legacy đã ngắt nhưng không lưu metadata/chứng cứ hiện tại; không có import/replay/migration mới. Không sửa SVG/âm thanh/Online/Bot hoặc R2-04. Kết quả mới nhất là mục này; số test trong phần R2-03B/README mô tả mốc trước R2-03C.

## Phạm vi hiện tại và các giai đoạn sau

| Giai đoạn | Công việc | Trạng thái hiện tại (engine R2-03C / UI R2-03B) |
| --- | --- | --- |
| Offline hai người | Kết nối engine với lật/đi/ăn, khởi tạo ván, phân màu, lượt đi và kết thúc ván | Đã triển khai bằng Unicode |
| Trường tróc | Rà soát nguồn, xử đuổi/cảnh báo/ưu tiên hòa | Engine + unit test và UI cảnh báo/kết quả đã triển khai |
| Online hai người | Backend Supabase riêng, mã phòng, đồng hồ, cầu hòa/chịu thua/kết thúc; bảo mật quân úp | Chưa triển khai |
| Bot | Một Bot mạnh, chỉ dùng thông tin công khai và xác suất | Chưa triển khai |
| Hoàn thiện giao diện | SVG của tác giả, âm thanh, animation sau khi gameplay ổn định | Chưa triển khai |

Chỉ một bước tiếp theo: **chủ dự án chơi thử cảnh báo Offline và nghiệm thu, sau đó mới giao hoàn thiện SVG/UX**. Chưa tự triển khai giai đoạn đồ họa/Online/Bot.

## Ràng buộc thực hiện R0

- Chỉ sửa trong workspace `banqi-game`; giữ nguyên thay đổi có sẵn của chủ dự án và nội dung prompt.
- Không bảng SQL, migration, schema, API key, Supabase client, Auth, Realtime hoặc Edge Functions.
- Không GitHub Actions, chỉnh settings repository/Supabase, commit/push GitHub hoặc deploy GitHub Pages. Project Supabase có thể liên kết GitHub tự động; không thay đổi backend.
- Không đưa mật khẩu hoặc secret vào mã nguồn/commit; `.gitignore` không tự loại bỏ secret đã được Git theo dõi.
- Chỉ chuẩn bị code local để Project Owner xem và phê duyệt.

## Tiêu chí nghiệm thu R0-01

1. Mở trực tiếp `index.html`, có thông báo chưa chơi được và đúng 32 ô úp.
2. Cả hai hướng co giãn trên màn hình hẹp; chữ/quân thẳng, không tràn ngang.
3. Đổi hướng nhiều lần không mất hoặc trùng ID/ô; quay lại ngang đúng vị trí; không lỗi JavaScript.
4. Ánh xạ đảo ngược được, bảo toàn quan hệ kề và đúng bốn góc.
5. Tài liệu phân biệt quyết định đã chốt, quy ước còn cần kiểm chứng và tính năng chưa làm.
6. Không backend, dependency nặng, tính năng ngoài phạm vi hoặc thay đổi iChess.
