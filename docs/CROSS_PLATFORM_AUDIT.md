# Kiểm toán hệ thống đa nền tảng

Ngày: 20/11/2026, timezone trao đổi `Asia/Bangkok`. Baseline: `a8b2d0b` (PR #8). Nhánh tài liệu: `Minh/cross-platform-migration-audit`.

## 1. Phạm vi và mức bằng chứng

Đã đọc source `server/`, `web/`, test, launch/build/import scripts, cấu hình Android/iOS, README, handoff, hướng dẫn Git và lịch sử hiện có. Không có root `AGENTS.md` trước task này. Lịch sử hội thoại ban đầu không đầy đủ; không suy diễn các yêu cầu không được ghi nhận. Không mở database vận hành qua `openDatabase()` vì hàm này chạy migration.

Các nhãn bên dưới:

- **Đã triển khai và xác minh**: có kiểm thử chạy trong lượt audit, với giới hạn môi trường được ghi rõ.
- **Đã triển khai nhưng chưa xác minh**: thấy source, chưa chạy tình huống tương ứng.
- **Triển khai một phần**: chỉ hỗ trợ một phần của kịch bản.
- **Chưa triển khai**: không có đường đi tương ứng trong source/API được audit.
- **Chưa biết**: thiếu bằng chứng môi trường hoặc thiết bị thật.

“Chưa triển khai” không tự biến một tính năng thành yêu cầu phải bổ sung.

## 2. Stack và cấu trúc hiện tại

| Thành phần | Hiện trạng đã kiểm tra |
| --- | --- |
| Web | JavaScript ES modules, HTML/CSS, DOM rendering; không React/Next.js/TypeScript/Tailwind |
| Backend | Node >=24, `node:http`, ESM; máy audit Node 26.13.0 |
| Database | `node:sqlite`, SQLite WAL, foreign keys, busy timeout 5000 ms; integer stock scale 1000 |
| Android/iOS | Cùng `web/` trong Capacitor 8.6.0; secure-storage 8.0.1 pin chính xác |
| Android | app ID `com.thebepteahouse.inventory`, minSdk24, compile/target36, versionName1.0/code1; AGP8.13.0, Gradle8.14.3; chưa cấu hình signing release trong source |
| iOS | Cùng bundle ID; app target15.4, version1.0/build1; SPM Capacitor exact8.6.0; Automatic signing nhưng chưa có DEVELOPMENT_TEAM trong project |
| QA | Node test runner, Playwright1.65.0, Playwright MCP hoạt động |
| Dependencies | Capacitor core/android/ios/CLI8.6.0; secure-storage8.0.1; Playwright1.65.0. Không cài thêm trong audit |
| Toolchain | Máy Windows có Java21, adb1.0.41/platform-tools37.0.1, SDK Platform36; không có `xcodebuild` trên PATH |
| Hạ tầng | Có local launchers; chưa xác nhận production backend, Vercel project, TLS, signed distribution hoặc store release |

`web/app.js`: state, auth, API, drafts, dialog và event. `web/view.js`: escaped HTML và định dạng. `web/styles.css`: responsive/theme. `server/http.mjs`: HTTP/auth/CORS. `server/inventory.mjs`: nghiệp vụ. `server/db.mjs`: schema/migration/transaction. `scripts/import-opening.mjs`: snapshot importer. `scripts/build-mobile.mjs`: copy web và ghi HTTPS API origin vào `dist/config.js`.

Database có 17 bảng: `locations`, `items`, `users`, `sessions`, `stock`, `movements`, `deliveries`, `delivery_lines`, `receipts`, `transfers`, `transfer_receipts`, `requests`, `delegated_actions`, `count_sheets`, `count_lines`, `counted_receipts`, `opening_balances`. Danh mục/schema được xác nhận từ `server/db.mjs`, không từ database vận hành. Không có migration-version framework.

## 3. Bản đồ workflow và checklist parity

Mỗi ID là tiêu chí bắt buộc đối chiếu khi migrate. Cột kiểm chứng chỉ áp dụng đến phạm vi test được ghi, không chứng minh toàn bộ UX trên điện thoại thật.

| ID / workflow | Hành động người dùng | Quy tắc và validation | Database/API | Kết quả và bằng chứng |
| --- | --- | --- | --- | --- |
| F01 Danh mục | Manager tạo item độc lập hoặc trong đơn giao; chọn category/SKU/unit/case size | Tên/category bắt buộc; SKU trùng bị chặn; item trùng có điều kiện bị chặn; case size nguyên dương, khác base case | `POST items`, `deliveries`; `items`, tạo `stock` đủ 5 nơi trong transaction | Item độc lập bắt đầu unknown; item tạo trong delivery known zero ở nơi nhận, nơi khác unknown. API tests xác minh; chưa có edit/delete item hoặc category CRUD riêng |
| F02 Đơn vị/số lượng | Chọn đơn vị của item; manager bổ sung unit còn thiếu | Scale1000, tối đa 3 số lẻ; factor riêng item; base `each` phải ra số cái nguyên; không âm; giới hạn stock 1 tỷ base units | `quantity()`, `count-units`; `items.units/base_unit`, scaled integers | Quy đổi túi/thùng/cái đúng, không suy đoán quy cách mơ hồ. API tests xác minh các case đã có; chưa có unit-test module độc lập |
| F03 Xem tồn/cảnh báo | Manager chọn một hoặc tất cả địa điểm; staff xem tồn tại nơi được cấp qua form | 5 nơi; unknown khác0; low khi known và on_hand<=threshold; null tắt ngưỡng; total bỏ unknown và ghi Tạm tính | `GET snapshot`; đọc `items/stock`; `thresholds/system-thresholds` chỉ manager | Tổng/ngưỡng từng nơi và hệ thống; API + browser smoke xác minh |
| F04 Nháp kiểm kê | Chọn nơi/category, nhập quantity/unit, tên người đếm và note; đổi nhóm/reload | Trống giữ tồn,0 xác nhận hết; scope theo API/catalog/account/location/category; marker riêng khi manager-switch; tên dùng chung trong scope | Chỉ `localStorage`, chưa ghi tồn; line lưu revision | Khôi phục nhóm hợp lệ và nháp đúng chủ; browser smoke/UI + MCP kiểm tra. Không phải bản nháp được đồng bộ server |
| F05 Gửi nhiều nhóm | Bấm Kiểm tra và gửi, xem các nhóm rồi xác nhận một lần | API một category/phiếu, 1–1000 unique lines; category khớp; revision còn mới; performer bắt buộc; client gửi tuần tự | `count-sheets`; `count_sheets/count_lines/stock/movements/requests`, mỗi category một transaction | Chỉ xóa nháp đã xác nhận và chưa bị sửa; có thể thành công một phần. API/browser tests xác minh phần hiện có; chưa có approval manager sau gửi |
| F06 Điều chỉnh lẻ | Manager nhập số thực đếm và note cho item/nơi | Cần revision mới; zero hợp lệ; staff bị cấm | `counts`; cập nhật stock+revision, insert movement `count` | Tồn thành số đếm; ghi delta và actor/time. Không tạo count_sheet; API tests stale revision xác minh |
| F07 Đơn giao NCC | Manager tạo 1–50 item duy nhất, nơi nhận, supplier, số dự kiến | Units hợp lệ, quantity>0; item mới phải hợp lệ; không trùng dòng | `deliveries`, `delivery_lines`, `requests`; có thể tạo item cùng transaction | Chưa tăng tồn khi tạo; API tests xác minh |
| F08 Nhận hàng NCC | Nhập thực nhận, tên người nhận, note, ảnh tùy chọn; nhận từng dòng hoặc cả phần còn chờ | Staff chỉ nơi mình và đơn manager tạo; actual>0, cumulative<=expected; cả lô kiểm tra outstanding chưa đổi; ảnh JPG/PNG/WebP<=5MB và kiểm header | `receipts/delivery-receipts-all`; receipt/photo BLOB, line cumulative, stock+movement+request | Chỉ phần nhận tăng tồn; còn chờ đúng; ảnh có authorization; invalid photo rollback. Tests API + smoke; nhận vào stock unknown vẫn unknown |
| F09 Xuất chuyển | Staff xuất từ nơi được cấp hoặc manager từ bất kỳ nơi; chọn nhiều item | Nguồn khác đích, 1–150 unique lines, source known và đủ stock, quantity>0 | `transfers`; batch/rows, giảm source qua `move`, request cùng transaction | Trừ ngay khi dispatch; chưa cộng đích; batch atomic, không tồn âm; API tests + concurrency ad hoc |
| F10 Nhận chuyển | Nhập thực nhận, receiver, có đóng phiếu không; nhận cả phần còn lại nếu đủ | Quyền theo destination; staff chỉ nhận shipment do manager tạo; overage cần final; thiếu/dư final cần lý do; final zero được phép | `transfer-receipts/transfer-receipts-all`; receipt, received/shortage/closed_at, stock+ledger+request | Cộng đúng actual; số đang đi giảm; final lưu discrepancy; retry không cộng lại cùng key. API tests xác minh |
| F11 Hàng đã tính trong phiếu | Manager chọn Đã tính trong phiếu khi xác nhận nhận từng dòng | Sheet count phải là lần kiểm kê gần nhất trong cả `count` và `sheet_count` của item/nơi; standalone count mới hơn làm sheet cũ không còn hợp lệ; tổng liên kết<=counted; transfer count không trước dispatch; staff không được dùng | `postReceipt/latestCount`; receipt vẫn lưu, movement delta0, `counted_receipts` liên kết count movement | Không cộng tồn lần hai; report phân bổ theo count boundary; API tests xác minh các case đã có; eligibility sau standalone count được xác định từ source |
| F12 Nhật ký | Manager tìm item/SKU/note/người đếm/account/nơi/ngày/type/order; Xem thêm | Ngày Atlanta inclusive, từng filter độc lập; normalize tiếng Việt; count khác sheet_count; cursor theo movement ID | `GET history`, join movement/user/item/location/count; batch50, đọc51 để tính next | Hiện actual performer và submitting account; 20 dòng/trang UI; history5 tests + smoke xác minh. Chưa có UI riêng cho delegated_actions |
| F13 Báo cáo/giá | Manager chọn tuần/nơi, xem tiêu hao, nhập đơn giá USD | Tuần Atlanta từ thứ Hai; end là sheet count cuối trong tuần, start là sheet count ngay trước; opening fallback; thiếu mốc=>unknown | `GET report`, `prices`; `count_lines/sheets`, movement, opening, counted_receipts; cost integer1/10000USD | Usage=start+purchases+incoming-outgoing-end; giá trị dùng tồn/giá hiện tại, không giá lịch sử. API tests xác minh; negative usage cảnh báo |
| F14 Đăng nhập/đăng xuất | Login, xác minh lại, logout online/offline native | Scrypt salted password; SHA256 token backend; staff native `expires=0`, web/manager12h; rate-limit20 thất bại/IP/phút; mỗi API kiểm session | `login/logout/snapshot`; users/sessions; browser sessionStorage, native SecureStorage | Native pending logout được lưu rồi chặn kho, retry revocation; API/smoke mock xác minh. Device report còn mở |
| F15 Tài khoản và delegation | Manager đổi staff password; chuyển staff, staff khác, về manager | Password12–256, khác cũ; chỉ thu hồi mọi session staff được chọn; manager token + `X-Staff-Account`, quyền staff ở backend | `staff-passwords`; users/sessions/requests; delegation insert `delegated_actions` khi write | Password replay cùng key không thu hồi phiên mới lần nữa; giữ tab staff, về manager mở Accounts; API/smoke xác minh |
| F16 Import | Operator chạy importer với captured Google Sheets JSON và output mới | Source/header/catalog/location/unit/quantity kiểm tra; không chấp nhận DB/login output đã có; NOT COUNTED=>unknown | `scripts/import-opening.mjs`; tạo schema rồi transaction locations/items/stock/opening/users; credentials file mới | One-time import; không live sync. Source đã audit, chưa chạy lại importer trong lượt này; current operational row counts chưa biết |
| F17 Export/approval | Tìm khả năng xuất dữ liệu, duyệt phiếu | Không thấy endpoint/UI export CSV/XLSX/PDF, không trạng thái chờ duyệt phiếu kiểm kê | Không có action tương ứng | Chưa triển khai; không thêm mặc định trong migration |
| F18 UX/vận hành | Menu manager/mobile, 3 tab staff, tìm/phân trang, dialog, refresh | Không overflow toàn trang; giữ focus/keyboard/touch; dirty-form confirm; không xóa nháp lỗi; theme thiết bị | `web/app.js`, `view.js`, `styles.css`; không đổi DB | UI/smoke kiểm tra 320/390px, theme/chữ lớn/draft/lỗi refresh; chưa đánh giá năng suất nhập liệu trên mọi thiết bị thật |

### Khác biệt Web / Android / iOS cho từng workflow

F01–F13, F15 và F18 dùng chung source và API trên cả ba; quyền phụ thuộc account, không platform. Manager vẫn có thể login native theo code; không loại các màn manager khỏi parity nếu chưa được duyệt. Không có native inventory algorithm khác để port.

- Web: URL/backend hiện cùng origin; token sessionStorage, drafts localStorage; file input dùng browser.
- Android tiêu chuẩn: bundle `dist/` được copy vào assets/public, API HTTPS; secure token Android Keystore/encrypted preferences; file chooser và keyboard qua WebView. Local debug dùng trang backend `/staff` qua ADB reverse; khác đường packaged build.
- iOS: bundle public, API HTTPS; token Keychain device-only; file picker/permissions do WKWebView/iOS; build cần macOS/Xcode. Native lifecycle mới nhất chưa rerun.
- F14 khác storage/lifetime như trên; staff native persistent, manager native không persistent. F04/F05 localStorage không tự chuyển sang RN AsyncStorage. F16 là CLI backend, không có UI import trên ba client. F17 không có trên cả ba.
- Photo selection đã có đường UI chung; hành vi picker/permission thực tế từng OS chưa được kiểm chứng trong lượt audit.

## 4. Bốn kịch bản quan trọng

| Kịch bản | Phân loại hiện tại | Bằng chứng và giới hạn |
| --- | --- | --- |
| A1 Hai nhân viên đếm cùng item/revision | Đã triển khai và xác minh | Hai HTTP requests đồng thời, key khác: 200/409; chỉ 1 sheet. `revision` kiểm trong `BEGIN IMMEDIATE`; không tự gộp count |
| A2 Cùng key/payload gửi lại | Đã triển khai và xác minh | Hai receipts cùng key trả cùng result, 1 row; DB requests UNIQUE(actor,key), kết quả+stock atomic |
| A3 Khác key cùng ý định sau reload | Triển khai một phần | Key/queue chỉ trong memory dialog; không có durable operation identity. Revision thường chặn count cũ; không bảo đảm semantic dedup mọi thao tác/key mới |
| A4 Threshold/price/catalog cạnh tranh | Triển khai một phần | Transaction chống ghi dở; giá/ngưỡng không có revision check. Hai update hợp lệ tuần tự có thể ghi giá trị sau cùng; chưa kiểm tải/multi-process |
| B1 Nguồn dữ liệu chung | Đã triển khai và xác minh | Cùng backend, stock write rồi GET đọc kết quả mới qua API/browser; không có database riêng trên mobile |
| B2 Tự đẩy thay đổi sang thiết bị khác | Chưa triển khai | Không polling/WebSocket/SSE. View khác giữ snapshot cũ đến refresh; native startup/resume xác minh lại |
| B3 Phát hiện refresh lỗi/stale draft | Đã triển khai và xác minh | UI giữ data cũ, báo lỗi inline; MCP sau manager đổi tồn, staff refresh hiện stale line; backend quantity30, nháp27 giữ nguyên |
| B4 Đồng bộ giữa ba binary thật qua WAN | Chưa biết | Browser/mocked native không chứng minh installed APK/IPA cùng origin/build; cần device/staging matrix |
| C1 Nhập offline khi màn đã mở | Triển khai một phần | MCP offline nhập27, local draft tồn tại, online reload khôi phục; không submit được đến server khi offline |
| C2 Cold start offline vào form kiểm kê đầy đủ | Chưa triển khai | Không catalog/snapshot offline store đã xác minh; native hiển thị chờ xác minh, không vào kho; browser chưa có service worker |
| C3 Outbox tự gửi/kết hợp conflict khi có mạng | Chưa triển khai | Không durable outbox, background sync, auto-merge hoặc auto-submit; retry bằng người dùng trong dialog |
| C4 Offline startup/logout native | Đã triển khai và xác minh trong browser mock | Smoke có stored token, offline recovery, tombstone logout, revoke; native physical chưa biết |
| D1 Atomic stock/ledger/idempotency | Đã triển khai và xác minh | BEGIN IMMEDIATE, rollback, constraints; API tests invalid photo/batch và same-key tests; không chứng minh HA/disaster recovery |
| D2 Hai dispatch tranh cùng tồn | Đã triển khai và xác minh | Hai transfer10 bag khi có14: 200/409, còn4, không âm; ad hoc in-memory HTTP |
| D3 Nhiều category cùng lần gửi | Triển khai một phần | Atomic từng category, không atomic toàn queue; partial success giữ nháp chưa xong; policy phải giữ |
| D4 Persistence/recovery/load nhiều process | Đã triển khai nhưng chưa xác minh đầy đủ | SQLite file/WAL được dùng local; suite mới dùng memory. Chưa restore backup, crash/power-loss, stress locks hay disk-full trong audit |

`readVersion` ở client loại kết quả fetch cũ sau đổi ngữ cảnh; không phải distributed version hoặc đảm bảo realtime. Một Node process dùng synchronous transactions không yield giữa các statement; snapshot/report đọc nhiều query không explicit read transaction nên chưa chứng minh consistent snapshot nếu vận hành nhiều process cùng DB.

## 5. Integrity, security và thiếu hụt cần quyết định

- `stock` khóa kép location/item; ledger tham chiếu stock/user; count_lines khóa sheet/item và unique movement; delivery line unique delivery/item; requests khóa actor/key. SQL values được parameterize; HTML dùng `esc()`.
- Idempotency fingerprint gồm action+JSON payload và delegated manager nếu có; cùng key khác payload=>409. Không tự đổi thứ tự/format payload khi retry qua adapter.
- Counted receipt của supplier hiện không kiểm timestamp count so với lúc tạo đơn, trong khi transfer kiểm count không trước dispatch. Giữ khác biệt này khi migrate; nếu muốn siết validation phải xin duyệt thay đổi nghiệp vụ, không coi đó là refactor.
- `move()` cập nhật balance, revision rồi ledger trong transaction; ảnh/doc/request cùng transaction khi action gọi. Không có automatic inventory overwrite khi count stale.
- Người đếm, account gửi và delegated manager là ba thông tin khác nhau; ledger/history không phải tamper-proof audit đối với người có quyền sửa file DB.
- Không có realtime sync, full offline-first, approval, export, category CRUD riêng, item edit/delete, backup scheduler, CI release workflow ở `main` được xác nhận. Không mặc định bổ sung tất cả.
- Migration schema hiện kiểm column và return sớm ở nhánh đã có `items.supplier`; không tự sửa mọi schema hỏng/mất bảng một phần. Cần fixture các schema cũ thực sự được hỗ trợ trước thay adapter/backend.
- Login rate limiting ở memory theo IP; cần đánh giá trusted proxy và nhiều instance trước production, chưa đổi trong audit. CORS là browser policy, không thay authentication.
- Ảnh nằm trong SQLite; cần đánh giá growth/backup/body limits của proxy trước release. Không tự tách object storage hoặc đổi DB.
- File credentials initial không phản ánh password sau reset; không đọc/nội suy account vận hành từ file đó.

## 6. Native migration và data continuity

Hash bốn file `app.js/view.js/styles.css/index.html` bằng nhau giữa web, dist, Android public và iOS public tại lượt audit. Prefix SHA256 lần lượt `41898800f7f87658`, `12275cb2d9ea902b`, `6e3f1866554777c4`, `23bdbb14881f84ab`. Đây không xác minh `config.js`, APK/IPA đã build hoặc binary đã cài.

Bridge hiện gọi `SecureStorage.internal*` phiên bản8.0.1, key `bep-session-v1:`+backend origin; record gồm token và có thể `logout:true`; iOS `accessibleWhenUnlockedThisDeviceOnly`, không sync. Android preferences `WSSecureStorageSharedPreferences` bị loại khỏi backup/device-transfer.

Expo SecureStore cũng dùng secure native storage nhưng không có bằng chứng format/key/service/alias tương thích Capacitor. Cần spike custom bridge đọc kho cũ rồi ghi kho mới an toàn, chuyển cả pending logout; hoặc xin duyệt đăng nhập lại. Không hứa giữ phiên chỉ vì cùng app ID. Nháp WebView localStorage cũng cần transfer adapter; đổi web origin sang Vercel không đọc được localStorage origin cũ qua cùng-origin policy.

Giữ app ID, signing key/team, backend origin và namespace là điều kiện cần. Cần kiểm Android signed in-place update, iOS TestFlight/device update, version tăng thật, không uninstall. Minimum OS của Expo/RN phải xác minh với fleet; không nâng iOS15.4/Android24 chỉ vì scaffold mặc định.

## 7. Kiểm thử đã chạy trong audit

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm.cmd test` | 22/22 pass | 17 inventory +5 history, in-memory SQLite |
| `node scripts/smoke-web.mjs` | Pass | Workflow browser, permissions, native bridge mock, restore/offline logout/revocation |
| `node scripts/verify-ui.mjs` | Pass | Theme, menu mobile, chữ lớn, draft/dialog/refresh; ảnh trong OS temp |
| Playwright MCP | Pass | Staff390px vi-VN/timezone Vietnam; offline draft27, online reload giữ27, manager API cập nhật30, refresh báo stale; không JS errors/overflow |
| Ad hoc concurrent counts | Pass | Hai request cùng revision khác key: 200/409, đúng1 sheet |
| Ad hoc concurrent transfers | Pass | Hai yêu cầu10 khi có14: 200/409, còn4 |
| Ad hoc same-key receipt | Pass | Hai request cùng key: cùng result, đúng1 receipt |
| Native config/hash/tool inventory | Đã đối chiếu | Không build/sync native trong lượt này |
| Android/iOS physical lifecycle, signed update | Chưa chạy | Không thể suy từ mock/emulator lịch sử |
| Import lại, restart DB file, backup restore, load test | Chưa chạy | Không động dữ liệu vận hành |

Các kiểm tra concurrency ad hoc và MCP chưa được lưu thành regression tests vì giai đoạn này chỉ được ghi tài liệu. Mốc M1 sẽ lưu chúng sau khi được duyệt. Các ảnh UI là artifact tạm, không commit.

## 8. Checkpoint, phạm vi Git và giới hạn audit

- Checkpoint source trước audit: `a8b2d0b`, repo `giaminh05/The-Bep-Inventory`; nhánh audit riêng giữ baseline. Có worktree lịch sử `Minh/verify-ios-staff-sessions` trong OS temp, không tích hợp.
- 297 file skills đã staged trước task; không sửa/stage/commit chúng. SHA256 của `git ls-files --stage -- .agents skills-lock.json`: `bb31699166c9dd9a5ebf9fe0bcf665abafa6aba25101d93a5222ae08fa887f66` để đối chiếu cuối task.
- Giữ database và WAL/SHM tại chỗ, không mở/sửa/import. Chưa tạo operational DB backup; code checkpoint không phải data backup. Trước migration rollout phải backup nhất quán và restore thử theo M1.
- Chỉ tài liệu được thay đổi. Kiến trúc trong `MIGRATION_PLAN.md` là đề xuất, chưa được người dùng phê duyệt triển khai.

## 9. Nguồn kỹ thuật chính thức tham khảo ngày 20/11/2026

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying): lựa chọn Node/container/static; không đòi đổi backend nghiệp vụ.
- [Next.js Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): ranh giới tương tác và browser state khi chuyển giao diện.
- [Vercel Functions runtimes, filesystem](https://vercel.com/docs/functions/runtimes#file-system-support): file SQLite trong function không phải persistent shared database. Khuyến nghị giữ API trên host có persistent disk là suy luận áp dụng cho project.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/): cần binary dev cho module native và kiểm thử tương thích thực.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): secure storage/lifecycle theo OS; không chứng minh đọc được Capacitor vault.
- [Expo SDK58 release](https://expo.dev/changelog/sdk-58): tài liệu hiện tại có SDK58/RN0.88 và toolchain mới; chưa chọn version cho project, chưa cài.
- [SQLite Online Backup](https://www.sqlite.org/backup.html): backup nhất quán; cần rehearsal trên bản sao, không copy riêng `.sqlite` đang có WAL hoạt động rồi coi là đủ.
