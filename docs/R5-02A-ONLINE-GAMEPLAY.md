# R5-02A — Authoritative gameplay backend

Checkpoint nghiệm thu 2026-11-25: **PASS backend**, từ baseline `0c39d87`.
Không thêm UI Online hoặc mở chế độ chơi Online trên Pages. Offline, Solo/Bot,
Drag, Mobile, SVG/SFX và Soul Fade không thay đổi. Không làm R5-02B.

## API và nguồn luật

`POST https://tpxbbissvjmtrhijnavw.supabase.co/functions/v1/banqi-match`
nhận publishable `apikey`, JWT người dùng trong `Authorization: Bearer ...`,
và JSON tối đa 1.024 byte. Không dùng publishable key thay JWT.

Các command (không nhận thêm field ngoài hợp đồng):

```js
{ op: 'getMine' }
{ op: 'snapshot', roomId }
{ op: 'start', roomId, requestId }
{ op: 'act', roomId, requestId, baseVersion, action: { type: 'flip', at: 'a1' } }
{ op: 'act', roomId, requestId, baseVersion, action: { type: 'move', from: 'a1', to: 'b1' } }
```

`roomId`/`requestId` là UUID; version là số nguyên không âm. Host là player 0,
guest là player 1; màu được engine gốc gán khi lật đầu tiên. Start cần đủ hai ghế
trong lobby còn hạn. Xáo quân và chọn lượt đầu bằng Web Crypto trên server.
Adapter import trực tiếp `js/engine.mjs`; không sao chép hay chỉnh luật.

Thành công trả `{ok:true, match:{roomId,player,version,snapshot,event}}`;
`getMine` trả `match:null` nếu chưa có ván. Start version 0; mỗi action được chấp
nhận tăng đúng 1. Snapshot/public event dùng allowlist sâu; quân úp chỉ có
`{occupied:true,faceDown:true}`. Không trả private board, RNG seed hoặc lịch sử
nội bộ. Client không gửi/ghi được state hay kết quả ván.

Lỗi ổn định gồm INVALID_INPUT, NOT_FOUND, NOT_READY, REQUEST_CONFLICT,
STALE_VERSION, NOT_YOUR_TURN, GAME_OVER, ILLEGAL_ACTION, ACTIVE_MATCH_EXISTS,
RECEIPT_LIMIT, RATE_LIMIT, UNAVAILABLE. Lỗi SQL không ra response. Khi mất mạng,
retry **cùng requestId và payload**; khi version stale, lấy snapshot mới trước
khi tạo command mới. Không suy ra action thành công từ trạng thái optimistic.

## Transaction và ranh giới bảo mật

- JWT xác minh bởi gateway (`verify_jwt=true`) và `@supabase/server@1.9.2`
  với issuer/audience/role. UID chỉ lấy từ claims đã xác minh.
- Read RPC chỉ service role gọi; xác minh membership trước khi đọc private state.
  Commit khóa hai UID theo thứ tự, rồi khóa room/state; kiểm tra membership,
  lobby revision, lượt và version lần nữa. Hai start cạnh tranh chỉ tạo một ván.
- Candidate do engine trên Edge tạo; SQL commit CAS ghi private state, public
  snapshot/event, version, kết quả và receipt trong cùng transaction. Candidate
  bị stale không ghi bất kỳ state hay receipt nào.
- Receipt khóa theo UID + room + requestId, so sánh toàn bộ command JSONB;
  retry trả **đúng response đã chốt**, kể cả sau các nước khác hoặc khi ván xong.
  Payload khác cùng ID bị từ chối. Chỉ lưu request được chấp nhận.
- Tối đa 120 request/phút/UID, lưu counter server; tối đa 16.384 receipt/phòng.
  Receipt đã nhận không bị xóa để lấy chỗ; đạt cap thì chỉ từ chối request mới.
- Các bảng private FORCE RLS, không client grants/policies. Hai RPC mới chỉ
  service role execute, SECURITY DEFINER và search_path rỗng. Không thêm private
  schema vào REST/Realtime, không tạo broadcast state.
- CORS chỉ Pages origin và localhost/127.0.0.1 cổng 5500/8080; response no-store.

## Vòng đời và tương thích lobby

TTL 20 phút chỉ dành cho lời mời waiting. Sau start, ván không hết hạn theo TTL
lời mời. Chính sách bảo toàn hiện tại: **không tự kết thúc ván vì thời gian**;
giữ ghế cho tới khi engine kết thúc. Snapshot/receipt của ván xong được giữ lại.
Ván bị bỏ dở chưa có abandon/timeout/cleanup tự động; đây là giới hạn backend
trước khi có UI gameplay, không phải kết quả hòa hay thua được suy đoán.

Migration mới khóa ghế active/finished và chặn thành viên active tạo/join phòng
khác. Không sửa RPC/Edge R5-01: create/join/leave/cancel của phòng waiting vẫn
hoạt động. Gọi create lobby khi đang active bị guard từ chối; Edge R5-01 cũ
trả lỗi chung UNAVAILABLE, chưa có UX riêng cho tình huống này. Khi engine
kết thúc, claim active được giải phóng, ghế lịch sử vẫn giữ nguyên.

## Bằng chứng QA

- **35/35 test mục tiêu PASS**: tái sử dụng 13 adapter/contract đúng hash;
  15 transaction trên PostgreSQL disposable; 7 HTTP/JWT với SDK thật.
- Transaction test bao gồm CAS cùng version, replay tại commit, khách rời
  giữa prepare/commit, slot protection, finish/receipt, RLS và throttling.
- **58/58 live checks PASS**, đúng 3 Anonymous identities; token chỉ trong RAM.
  Có start race, CAS race, double-submit, replay, stale/wrong-turn/illegal move,
  JWT giả, outsider, REST/RPC private deny và private Realtime deny.
- Một ván live chơi bằng public legal actions, không dùng Bot/seed/private
  fixture/SQL chỉnh state: **97 action = 32 flip + 35 move + 30 capture**.
  Engine kết thúc `all_pieces_captured`, player 0 thắng. Hai ghế đồng bộ trạng
  thái; retry receipt đầu vẫn đúng và start không reset được ván đã xong.
- **8/8 audit catalog live PASS**: migration, RLS, policies, schema/table ACL,
  publication, RPC ACL, seat guard. `banqi-match` v1 ACTIVE, verify_jwt=true;
  preflight/rooms vẫn v1. CLI đã bundle trực tiếp engine gốc.
- Syntax/hash/diff checks PASS. Không chạy lại full regression, Bot benchmark
  hay đối chứng. Bằng chứng baseline vẫn là **557/559**, Drag recheck **11/11**;
  không tuyên bố full suite PASS. Không coi API gate là test thiết bị thật.

Log có trong `.local-qa/r5-02a/` (ignored), đặc biệt
`transaction-final-v2.log`, `handler-01.log`,
`live-gameplay-1795624227352.json`, `live-catalog.log`, `live-functions.log`.
Test mới: `tests/match/`; audit read-only: `tests/match/audit.sql`.
Một lỗi tên cột trong fixture rate-limit đã sửa trước khi nghiệm thu; giữ log
thất bại cũ để truy vết. Không sửa source gameplay sau live gate.

## Triển khai

Migration additive `20261125000200_r5_02a_match.sql`; không tạo lại database.
Chỉ deploy thêm Edge `banqi-match`, không thay hai function cũ. Khi rollback
ứng dụng không xóa state/receipt; tắt endpoint mới nếu cần điều tra, giữ schema
để bảo toàn bằng chứng. Chưa có frontend gọi API này.

Engine SHA-256:
`cf56e5769210399a0f76c1f966d6b035d78b836e477aacc8a4500ee212502be8`.
Regex WIP của `tests/rooms/public-smoke.cjs`, ZIP, prompt, QA/log và secrets
được giữ ngoài commit R5-02A.
