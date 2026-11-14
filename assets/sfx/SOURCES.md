# Âm thanh Offline Beta

Ba MP3 do chủ dự án tải và đặt sẵn, không tải lại, chỉnh âm hoặc chuyển mã trong R3. Xác minh ngày 2026-11-14: metadata tải xuống Windows của từng file trỏ đúng ID/tên gốc bên dưới; trang nguồn ghi **Creative Commons 0**. Không lưu URL tải có chữ ký hoặc metadata Windows vào Git.

Tác giả: **el_boss**, bộ Chess Puzzle Blitz SFX trên Freesound. Giấy phép [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Attribution được giữ để truy xuất nguồn dù CC0 không yêu cầu.

| File trong game | Nguồn | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `flip.mp3` | [Piece Slide.mp3 — 546118](https://freesound.org/people/el_boss/sounds/546118/) | 5460 | `25d1c87adbcf749afebb83a21e4c4b7c50ff1b7c65398e94e348024eb78fdbf1` |
| `move.mp3` | [Piece Placement.mp3 — 546119](https://freesound.org/people/el_boss/sounds/546119/) | 2680 | `8e9761cd9f833c67fae4043126cc638df10c4cc5bfb8760f46fe8f259d7a4b92` |
| `capture.mp3` | [Piece Capture.mp3 — 546120](https://freesound.org/people/el_boss/sounds/546120/) | 4310 | `c447674370e3e511270948e6e831eb9107ed64ed76645d581cf2a978b221871a` |

Nguồn công bố mono, 48 kHz; độ dài lần lượt khoảng 0.339 / 0.111 / 0.236 giây. Test Chrome kiểm tra HTTP `audio/mpeg` và decode cả ba file thật. Trò chơi dùng Audio cục bộ, volume 0.35, một tiếng mỗi sự kiện hợp lệ, dừng tiếng cũ trước tiếng mới. Không nhạc nền, CDN, tracking hoặc tổng hợp âm thanh.

Nút Bật/Tắt mặc định bật, lưu lựa chọn `banqi-sound`; storage bị chặn vẫn dùng được trong phiên. Lỗi phát không cản nước đi; file lỗi không tự retry. Nếu bỏ bộ âm thanh khỏi bản phân phối, phải đặt manifest `SOUNDS` trong `js/effects.mjs` thành `{}` để tắt nút và không yêu cầu URL thiếu.
