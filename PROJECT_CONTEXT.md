# The Bếp Inventory — Bối cảnh dự án

Cập nhật ngày 20/11/2026 theo timezone trao đổi `Asia/Bangkok`. Đây là handoff sống cho ứng dụng đang hoạt động; phải đọc cùng source, Git status/diff và `AGENTS.md` khi bắt đầu phiên mới.

## 1. Trạng thái hiện tại và yêu cầu mới nhất

Dự án đã có Web quản lý/nhân viên và Android/iOS Capacitor, cùng backend Node.js và SQLite. Người dùng yêu cầu kiểm toán, thiết kế migration sang giao diện hiện đại trên ba nền tảng, bảo toàn toàn bộ nghiệp vụ và dữ liệu. **Chưa phê duyệt kiến trúc rebuild hoặc viết mã migration.**

Phạm vi giai đoạn đầu: chỉ tạo/sửa `AGENTS.md`, tài liệu này, `docs/MIGRATION_PLAN.md` và audit trong `docs/`. Không sửa source, dependencies, database/schema, native project hoặc hạ tầng triển khai. Không production deployment. Giao tiếp và tài liệu dự án dùng tiếng Việt từ nay cho đến khi người dùng yêu cầu đổi.

Milestone hiện tại: **M0 kiểm toán/tài liệu đã hoàn tất; chờ phê duyệt G1/G2** trong kế hoạch. Chưa có feature nào được migrate. Đề xuất: Next.js Web theo từng phần, giữ backend/SQLite và Capacitor trong giai đoạn chuyển tiếp, React Native/Expo chỉ sau gate tương thích native.

Tài liệu liên quan:

- [Quy tắc lâu dài](AGENTS.md).
- [Audit, workflow và bằng chứng kiểm thử](docs/CROSS_PLATFORM_AUDIT.md).
- [Kiến trúc đề xuất, milestone/task tracker, approval gates và rollback](docs/MIGRATION_PLAN.md).
- [Kế hoạch history regression đã thực hiện](docs/superpowers/plans/2026-11-20-history-regression-tests.md).

## 2. Tổng quan và kiến trúc đang chạy

The Bếp Teahouse Inventory phục vụ Duluth, Johns Creek, Norcross, Kho DL House, Kho Extra. Ba nơi đầu là cửa hàng, hai nơi sau là kho. Skill/yêu cầu ban đầu nhắc ba cửa hàng; implementation và quyết định về sau dùng đủ năm địa điểm, phải giữ đủ.

Giao diện tiếng Việt. Ngày nghiệp vụ và báo cáo dùng `America/New_York` (Atlanta), không theo timezone điện thoại hay timezone trao đổi Bangkok.

| Lớp | Hiện trạng |
| --- | --- |
| Web | JavaScript ES modules thuần, HTML/CSS, DOM rendering; cùng source theo effective role |
| Backend | Node.js >=24, ESM, built-in HTTP server; vừa phục vụ `web/` vừa `/api/` |
| Database | `node:sqlite` synchronous, SQLite WAL, foreign keys và busy timeout; stock/chứng từ/ledger/photo BLOB cùng DB |
| Android/iOS | Capacitor8; package đã cài8.6.0; secure-storage pin8.0.1 |
| Android | minSdk24, compile/target36, Gradle8.14.3, AGP8.13.0; JDK21 local; version1.0/code1 |
| iOS | Xcode+SPM; app deployment target15.4, version1.0/build1; SPM exact Capacitor8.6.0 |
| QA | Node test runner, Playwright1.65.0, Playwright MCP |
| Dependency tracking | `package.json` version0.1.0, `pnpm-lock.yaml`; chưa có React/Next/RN/Expo |

Browser dùng relative API origin thông thường. Mobile tiêu chuẩn copy `web/` sang `dist/`, ghi HTTPS backend origin vào generated `config.js`, rồi Capacitor copy assets vào native project. Android local debug có thể load trực tiếp trang backend qua ADB reverse thay vì bundle đóng gói.

Token web lưu trong tab `sessionStorage`; token staff native trong secure store. Nháp và UI context dùng localStorage của browser/WebView. Không có database tồn kho riêng trên mobile.

## 3. Mã nguồn và điểm truy cập

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `web/app.js` | State/API/auth restore, event/dialog, drafts, sequential count submission, staff switching |
| `web/view.js` | Escaped HTML render, navigation, forms, history/report/accounts và định dạng |
| `web/styles.css`, `web/index.html`, `web/config.js` | Responsive/theme, app containers, API origin |
| `server/http.mjs` | HTTP/static, auth, sessions, delegation, CORS, API dispatch |
| `server/inventory.mjs` | Validation/quyền, stock movements/documents, history/report/snapshot |
| `server/db.mjs` | Schema, additive migrations, transaction, hashing, demo seed |
| `scripts/import-opening.mjs` | One-time import captured Sheets JSON vào DB mới và initial logins mới |
| `scripts/build-mobile.mjs` | Copy assets và ghi HTTPS API origin |
| `scripts/open-demo.ps1` | Start/reuse backend local đúng profile |
| `scripts/run-android-local.ps1` | Sync/build debug, chọn emulator/device, ADB reverse, install/launch |
| `scripts/run-web-android-local.ps1` | Launcher Web/Android cùng demo backend |
| `test/inventory.test.mjs` |17 API/inventory tests dùng DB memory|
| `test/history.test.mjs` |5 regression tests history/filter/date/pagination/authorization|
| `scripts/smoke-web.mjs`, `scripts/verify-ui.mjs` |Browser integration/native bridge mocks và UI/responsive QA|
| `android/`, `ios/` |Capacitor native shells/config, không có business layer native riêng|
| `.github/copilot-instructions.md` |Quy tắc branch/commit/PR hiện hữu, giữ nguyên|
| `data/` |DB vận hành/demo, snapshot, credentials/logs local, ignored by Git|
| `dist/`, native `public/` |Generated bundles, ignored by Git|

API đọc: `GET /api/health`, `/api/snapshot`, `/api/history`, `/api/report`, `/api/photos/{id}`. Auth: `POST /api/login`, `/api/logout`.

API actions: `counts`, `count-sheets`, `thresholds`, `system-thresholds`, `prices`, `count-units`, `items`, `deliveries`, `receipts`, `delivery-receipts-all`, `transfers`, `transfer-receipts`, `transfer-receipts-all`, `staff-passwords`, dưới `POST /api/`.

Protected routes dùng bearer token; actions dùng `Idempotency-Key`; manager delegation dùng `X-Staff-Account`. Photo endpoint không public. CORS native cho `https://localhost` và `capacitor://localhost`.

17 bảng và quan hệ được liệt kê trong audit. Các nhóm chính: catalog/location/users/sessions; stock/movements; deliveries/lines/receipts; transfers/receipts; count_sheets/lines/counted_receipts; opening_balances; requests/delegated_actions. `openDatabase()` có thể tạo schema/migrate/seed; không dùng nó để kiểm tra read-only database vận hành.

## 4. Nghiệp vụ và quyết định phải bảo toàn

### 4.1 Tồn, quy đổi, ngưỡng và danh mục

- Số lượng lưu integer scale1000; tối đa ba số lẻ, units riêng item, base `each` phải quy đổi ra số cái nguyên; stock không âm và tối đa1 tỷ base units.
- `known=false` khác số0: API trả unknown/null. Ô kiểm kê trống không cập nhật tồn; nhập0 xác nhận hết hàng.
- Item độc lập mới có tồn unknown mọi nơi. Item tạo trong đơn giao có known-zero ở nơi nhận, nơi khác unknown. Nhận hàng vào tồn unknown vẫn giữ unknown.
- Catalog có create và bổ sung base unit còn thiếu; không suy ra có đầy đủ edit/delete/category CRUD. SKU/duplicate/case-size validation phải giữ.
- Low-stock khi tồn đã biết và `on_hand <= threshold`; threshold null tắt riêng cảnh báo đó. System threshold độc lập tổng ngưỡng từng nơi; cộng phần tồn đã biết, UI ghi Tạm tính khi thiếu nơi.
- Giá USD theo base unit, lưu integer scale10000; valuation hiện tại là provisional khi thiếu giá/tồn. Không phải historical cost accounting.

### 4.2 Counts, transactions và retry

- `move()` cập nhật stock, tăng revision và insert ledger actor/time/delta/balance/reference/note/known flags.
- `applyAction()` đặt action và saved idempotency result trong `BEGIN IMMEDIATE`; lỗi rollback cả action. Requests unique theo actor/key; key cũ payload khác=>409. Fingerprint giữ nguyên payload và delegated manager identity.
- Count lẻ manager và count sheet đều kiểm `revision` ngay trong transaction; stale=>409, không overwrite giao dịch chen vào. Không tự merge hai số đếm.
- Một category/phiếu,1–1000 unique lines đúng category; performer bắt buộc; chỉ những item đã nhập được cập nhật.
- Một xác nhận UI gửi tất cả category đã đếm tại nơi chọn **tuần tự**. Mỗi category atomic; cả lần gửi có thể thành công một phần. Giữ thông báo tiến độ và nháp phần chưa xác nhận.
- Khi outcome chưa rõ, retry cùng payload/key trong dialog. Queue/key hiện chỉ ở memory, không bền qua kill/reload. Không tuyên bố exactly-once cho mọi request mới/key mới.
- Chỉ xóa các dòng nháp đã xác nhận và chưa bị sửa đồng thời. Không auto-submit draft khi restore.

### 4.3 Đơn NCC, chuyển kho và ảnh

- Manager tạo đơn1–50 unique items; chưa cộng tồn khi lập đơn. Nhận tăng đúng actual, không vượt expected; có nhận từng phần và toàn bộ outstanding.
- Transfers1–150 unique lines/batch; source khác destination, known và đủ stock; trừ nguồn ngay dispatch; đích chỉ tăng actual receipt. Batch dispatch/receive-all atomic trong action.
- Staff chỉ thao tác nơi được cấp. Staff nhận incoming shipment chỉ khi creator là manager. Shipment tạo khi manager switched-to-staff vẫn là staff-authored, không trở thành manager-created.
- Final shortage/overage cần reason; overage phải final; final zero có thể đóng thiếu; đủ tự đóng. Lưu discrepancy riêng, không inflate destination.
- Receive-all kiểm ID/outstanding snapshot còn đúng trước ghi. Receiver bắt buộc. Photos JPEG/PNG/WebP<=5MB, kiểm magic header, lưu SQLite và đọc có authorization; ảnh batch NCC gắn receipt đầu.
- `Đã tính trong phiếu` chỉ manager: sheet count phải là movement kiểm kê gần nhất của item/nơi khi xét cả `count` lẫn `sheet_count`; standalone manager count mới hơn làm sheet cũ không còn hợp lệ. Cumulative linked<=counted; transfer còn yêu cầu count không trước dispatch. Supplier hiện không kiểm timestamp count so với lúc tạo đơn. Không tự đổi khác biệt này khi port. Receipt vẫn ghi quantity, stock delta0 và revision vẫn tăng.

### 4.4 Reports và history

- Week bắt đầu thứ Hai Atlanta. End là sheet count cuối trong tuần chọn; start là sheet count ngay trước end, kể cả cùng tuần hoặc bỏ nhiều tuần. Opening import hợp lệ có thể làm mốc đầu nếu chưa có prior sheet.
- `usage = beginning + supplier_receipts + transfer_in - transfer_out - ending`, theo movement boundaries. Counted receipt được quy vào count movement boundary để không đếm hai lần.
- Không đủ mốc=>usage unknown; negative usage cảnh báo. Standalone manager `count` không tạo count_lines, không tự thành report sheet boundary.
- Report valuation luôn dùng tồn và giá **hiện tại**, dù đang xem tuần cũ.
- History lọc independent/combined theo item/SKU/note/actual performer/account/location/ngày inclusive Atlanta/type/order; normalize tiếng Việt; cursor theo movement ID, server50 mỗi batch,UI20 mỗi trang.
- `Kiểm kê`=`count`, `Phiếu kiểm kê`=`sheet_count`, `Tất cả kiểm kê`=cả hai. Không đổi ý nghĩa khi đổi label.
- Timestamp hiển thị locale `vi-VN`, timezone Atlanta. Hai instant DST fall-back có thể cùng hiện01:30 do UI chưa ghi offset; filter vẫn đúng.

### 4.5 Auth, delegation, draft và native lifecycle

- Password salted scrypt, bearer token random, backend lưu SHA256 token. Native staff yêu cầu `native:true` có `expires=0`; web và manager native vẫn12h. Mỗi API kiểm row session, không coi indefinite là không revoke được.
- Staff password reset manager-only,12–256 ký tự, khác cũ; atomic update hash và xóa mọi session đúng account đó. Account khác/manager còn usable. Same-key retry không revoke phiên mới lần nữa; fingerprint reset salted.
- Manager switching giữ manager token, chọn effective staff qua header, backend áp quyền staff, write ghi cả manager/staff trong delegated_actions. Chưa có UI riêng cho bảng delegation. Reload trở về authenticated manager context; staff-to-staff giữ supported tab; về manager mở Accounts.
- Native secure-storage8.0.1 dùng internal bridge methods, key gồm backend origin, iOS device-only unlocked/syncfalse; Android Keystore/encrypted preferences. Không nâng plugin hoặc đổi origin/ID/signature/namespace vô tình.
- Native cold start/resume xác minh token với server. Offline giữ token nhưng không mở inventory đã xác minh. Offline logout lưu pending logout trước, chặn kho, retry revoke khi online rồi xóa record.
- Capacitor logging tắt; Android backup rules loại encrypted preferences. Backend revocation vẫn thắng dù token cũ được restore.
- Draft localStorage scope API origin + first catalog item ID + account + location + category; manager-switch có marker riêng. Giữ tương thích legacy draft và fallback tên; shared performer lưu theo scope/location và hiện vẫn giữ sau submission đến khi sửa.
- Menu manager desktop/sidebar và mobile Chức năng; staff ba tab cuối; action kiểm kê sticky; safe areas,theme,focus,dirty-form confirmation,lỗi inline,20-row pagination hidden khi dưới2 trang cần bảo toàn.

## 5. Trạng thái chức năng và các kịch bản trọng yếu

Workflow F01–F18 và nhãn evidence từng phần ở audit. Bản tóm tắt:

| Khu vực | Trạng thái và giới hạn |
| --- | --- |
| Stock/catalog/counts/receipts/transfers/accounts/history/report |Đã triển khai; API/browser tests xác minh các kịch bản ghi trong audit, không chứng minh mọi thiết bị thật|
| Concurrent counts |Đã triển khai và xác minh một server/memory DB: cùng revision khác key=>200/409,1 sheet|
| Cạnh tranh dispatch và idempotent receipt |Đã triển khai và xác minh ad hoc: không âm; cùng key chỉ1 receipt|
| Multi-category transaction |Triển khai một phần: atomic theo nhóm, không all-or-nothing cả queue|
| Cross-device sync |Cùng backend và refresh có kết quả mới đã kiểm; tự push realtime chưa triển khai; cả3 binary trên WAN chưa biết|
| Offline counts |Một phần: đang mở có thể nhập/lưu nháp; cold start đầy đủ và durable outbox/auto-sync chưa triển khai|
| Offline startup/logout auth |Đã triển khai, browser bridge mock pass; physical device current cycle chưa biết|
| Config edits cạnh tranh |Transaction có, giá/ngưỡng không có revision lock; chưa thêm conflict policy|
| Persistence/backup/restore/HA |SQLite file có source/local artifacts; chưa rehearsal backup/restore/crash/load trong audit mới|
| Import/export/approval |One-time Sheets snapshot importer có source, chưa chạy lại; live sync/export/approval chưa triển khai|
| Native packaging |Android/iOS shells có;4 common web files hashes khớp bundles hiện tại;installed APK/IPA/signing/physical behavior chưa xác nhận|
| Migration stack |Next.js/TypeScript/Tailwind/shadcn và RN/Expo chưa triển khai; đang chờ duyệt|

## 6. Bằng chứng kiểm thử và tiến trình lịch sử

### 6.1 Kết quả mới nhất trong giai đoạn audit tại baseline a8b2d0b

- `npm.cmd test`: **22/22 pass**,17 inventory+5 history.
- `node scripts/smoke-web.mjs`: pass inventory/browser flows, native bridge mock restore/offline logout/two-device revocation.
- `node scripts/verify-ui.mjs`: pass themes,mobile navigation,large text,drafts,dialog dismissal,refresh recovery; screenshots ở OS temp, không commit.
- Playwright MCP: staff390px,vi-VN,timezoneVietnam; offline nhập27 giữ draft;online reload khôi phục27;manager cập nhật30 qua API;staff refresh hiện stale line;không page overflow/JS errors.
- Ad hoc HTTP/memory: concurrent count cùng revision200/409 và1 sheet;hai dispatch10 khi có14=>200/409,còn4;hai receipts cùng key=>cùng result,1 receipt.
- Hash app.js/view.js/styles.css/index.html khớp web/dist/Android public/iOS public. Không chứng minh config.js hoặc binary đã cài.
- Không mở database vận hành,build/sync native,kiểm physical device,import lại,restore backup hoặc thay hạ tầng trong audit.

Các ad hoc/MCP checks chưa committed thành test; M1 sẽ lưu sau approval. Regression history đã committed trong PR#8: optional/combined filters,Atlanta winter/summer/DST,pagination123 matching rows,cursor boundary50,validation và staff denial. Lượt trước5/5 pass với TZ=Asia/Ho_Chi_Minh và tests bắt cả4 mutation trong temporary backend copies: bỏ person filter,UTC date,reverse sort,inclusive cursor. Không sửa production source để thử mutation.

### 6.2 Bằng chứng lịch sử, không thay kết quả latest native build

- Suite API từng tăng11→15→16→17; staff switching từng pass17 API+Chrome smoke.
- Native session development từng pass Android debug và unsigned Release;API36 emulator login,force-stop,reboot,in-place APK replacement,logout/reopen. Ngày20/11 emulator cold relaunch đọc cùng token fingerprint,server200,staff view restored.
- iOS unsigned Release và Simulator lifecycle (login/reopen/reboot/reinstall/logout/reopen) từng chạy trên macOS Actions. [Release build run](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42955944659), [Simulator lifecycle run](https://github.com/giaminh05/The-Bep-Inventory/actions/runs/42956431684). Đây là các revision lịch sử, chưa rerun latest UI/HEAD.
- Tại8efb6f4 ngày20/11:17 API,smoke/UI pass. Smoke lần đầu bị selector text Xuất chuyển khớp hidden option; đã sửa sang visible history rows và pass.
- Cleanup d3f933f bỏ hai Android example tests không hữu ích (old package ID và2+2),test metadata/runner/JUnit/Espresso tương ứng. Sau cleanup17 API+smoke+UI vàAndroid assembleDebug pass.
- Ad hoc history cũ kiểm date-only/combined,Atlanta winter/summer/DST,localeVietnam,52-row pagination hai chiều; phần history nay có committed regression qua PR#8.
- 4419a66 từng merge trước khi test; các checks8efb6f4 thực hiện về sau. Không kể là đã test tại thời điểm merge cũ.
- README còn ghi iOS chưa chạy; context này ghi rõ bằng chứng lịch sử mới hơn. Không sửa README trong task allowlist hiện tại.

## 7. Vấn đề mở và rủi ro đã biết

1. Người dùng từng báo mất login trên điện thoại thật; emulator pass nhưng chưa tái hiện trên đúng thiết bị/build. Cần OS,role,build/install method,uninstall hay force-stop,API origin và password reset history; không lấy thông tin mật khẩu/token.
2. Lọc riêng19/11 từng hiện7/11: fresh fixtures/current server gửi from/to đúng và chỉ trả19/11; listener4170 khi đó là backend cũ, chạy mới gặp EADDRINUSE. Đây là nguyên nhân có khả năng cao, chưa chứng minh mọi dữ liệu thật. Restart đúng backend sau đổi server; không tự kill process không liên quan.
3. Native update sang RN có rủi ro token,logout tombstone,WebView draft không tương thích Expo SecureStore/AsyncStorage; cùng app ID chưa đủ. Web origin mới trên Vercel cũng không tự đọc draft localhost cũ.
4. Các request keys chỉ sống trong dialog; không có durable outbox/semantic dedup mọi key mới. Không tự thêm auto-retry/merge như thể đã là luật hiện hữu.
5. Backend một process synchronous giúp giữ atomic action; read snapshot/report nhiều query chưa có explicit read transaction cho multi-process scenario. Chưa stress/load/HA test.
6. Importer chỉ snapshot một lần; current live item counts/quantities chưa đọc lại. Không dùng initial login file làm nguồn password hiện hành.
7. Chưa xác nhận production backend/domain/TLS/Vercel project;Android release signing/Apple team/TestFlight/store release và RPO/RTO chưa biết. Không chọn nhà cung cấp hoặc nâng minimum OS âm thầm.
8. Bảng requests chưa có cleanup policy;ảnh SQLite và snapshot documents tải nhiều cần đo growth/performance trước release,không tự đổi storage/DB.

## 8. Local run, môi trường và deployment

- `data/inventory.sqlite`: dữ liệu nhập vận hành; `data/demo.sqlite`: demo. WAL/SHM có thể chứa commit mới; không copy riêng main file rồi coi là backup nhất quán.
- `data/inventory-logins.json`: initial credentials, không in ra chat/docs/PR;password reset làm file lỗi thời. `data/sheet-opening.json`: captured sheet dataset; không truy cập live Sheet trong audit.
- Direct `node server/http.mjs` mặc định demo,loopback4170. `Mo-The-Bep.cmd`/open-demo launcher chọn imported DB4171 khi có, trừ khi `-Demo`.
- `Mo-The-Bep-Web-Android.cmd` luôn demo; `Mo-The-Bep-Android.cmd` chọn theo launcher arguments. `npm.cmd start` chỉ web/backend, không build Android.
- Android local overlay loads127.0.0.1:4170/staff qua ADB reverse đến backend4170/4171. Packaged native dùng HTTPS API origin thật; tài liệu example.com là placeholder.
- Giao diện web/debug có thể lấy static assets mới khi reload;backend code phải restart server. Kiểm listener/start time khi EADDRINUSE,không mở browser rồi coi server đã đổi.
- Build native khi được duyệt: `npm run build:mobile -- <HTTPS-backend-origin>`, `npx cap sync android`/`ios`, sau đó Gradle/Xcode. Các lệnh này ghi generated/native files nên chưa chạy trong audit.
- App ID/signature/storage namespace ổn định;Capacitor logging none; backup exclusions giữ nguyên. iOS15.4 app target mới là giới hạn hiện tại,không dựa chỉ vào Package.swift .v15.

Tên biến cấu hình: `BEP_DB`, `BEP_PORT`, `BEP_HOST`, `BEP_LIVE`, `BEP_ORIGINS`, `BEP_API_URL`;QA overrides `BEP_PLAYWRIGHT`, `BEP_CHROME`;toolchains `ANDROID_HOME`, `JAVA_HOME`. Chỉ ghi tên,không ghi secrets hoặc production values.

## 9. Lịch sử quyết định và Git

### 9.1 Quyết định người dùng trước migration

- Giữ existing project,không rewrite framework khi chưa có yêu cầu;không live Sheets sync/POS/sales integration được duyệt. Yêu cầu mới mở việc đánh giá rebuild,**chưa phê duyệt triển khai**.
- Git branch đúng prefix `Minh/`,từ main,commit/push rồi merge qua PR;đã bác prefix codex/Copilot. Không gom customization unrelated.
- Báo cáo consumption theo latest sheet count và preceding count;đã thay cách hiểu hai tuần lịch kề nhau.
- Manager mobile navigation cũ dạng horizontal tabs sau đó thay bằng menu Chức năng;giữ keyboard/touch/focus và không page overflow.
- Draft restore đúng account/location/category;gửi mọi nhóm đã đếm bằng một xác nhận thay cho bắt gửi từng category;backend vẫn từng category atomic.
- Pagination20,ẩn Previous/Next/status nếu dưới2 trang.
- Manager reset password staff mọi nơi và revoke sessions;cần giữ native staff login qua close/force-stop/reboot/update nhưng explicit logout/password reset phải revoke.
- Offline startup không coi token là verified;offline logout chặn kho rồi revoke khi online. Không lưu password.
- Manager switch staff không login lại/không password staff;staff-to-staff giữ tab deliveries/transfers;về manager mở Accounts.
- Performer nhập một lần dùng qua category;history tra actual performer/account/date/location rõ ràng.
- Đã từng giao tester riêng để tiết kiệm;về sau người dùng yêu cầu assistant test trực tiếp. Theo yêu cầu hiện tại,không mặc định cấm test hoặc mặc định bỏ QA.
- Duy trì handoff sống với evidence,open bugs,workflow. Giới hạn chỉ PROJECT_CONTEXT.md của task handoff cũ là lịch sử,không còn là phạm vi hiện tại;allowlist mới ở §1 có hiệu lực.

### 9.2 Các commit quan trọng

| Commit | Mốc |
| --- | --- |
|f36d10f|Local baseline|
|69336a2|Initial GitHub import qua PR#1|
|8d61949|Ghi quy trình branch Minh/|
|5e6c655|PR#2 navigation,draft restore,multi-category,pagination|
|58ea094|PR#3 staff password reset|
|8985bbc|PR#4 secure persistent native sessions|
|ed986c9|PR#5 manager switching|
|7874780 /78a0ae7|Combined web/Android launcher và one-command demo|
|85ccc05 /31d592a|PR#6 UI polish|
|8efb6f4 /4419a66|PR#7 giữ staff tab,shared performer,history filters|
|2142e27 /d3cc61c|Context handoff mở rộng|
|62b9182 /d3f933f|Cleanup Android test scaffolding|
|a8b2d0b /25c5483|PR#8 history regression5 tests,API suite22/22|

Repo: `https://github.com/giaminh05/The-Bep-Inventory`. Baseline đầu audit main/origin/main=`a8b2d0b`;nhánh tài liệu `Minh/cross-platform-migration-audit`. 297 skill/customization files đã staged từ trước,không thuộc migration commit. Ba native files từng bị báo line-ending-only modified ở handoff cũ;đầu audit mới không có application/native diff. Luôn kiểm status thực tế.

Worktree lịch sử `Minh/verify-ios-staff-sessions` trong OS temp chứa verification-only workflows/probes,không có trên main và không merge tình cờ. Khi rollback version code,không suy ra được phép rollback/xóa dữ liệu vận hành.

Bản handoff tiếng Anh trước task có thể tra nguyên văn trong Git tại `a8b2d0b:PROJECT_CONTEXT.md`;bản tiếng Việt này cập nhật trạng thái mới,giữ quyết định lịch sử và chuyển bản đồ workflow chi tiết sang audit để tránh lặp.

## 10. Công việc tiếp theo và cách bàn giao

1. Người dùng xem/phê duyệt phương án A/B/C và M1 trong `docs/MIGRATION_PLAN.md`;chưa viết code rebuild trước bước này.
2. M1 đề xuất: committed concurrency/cross-client/offline-draft regression,contract/parity matrix,backup/restore rehearsal trên dữ liệu thử. Không thay schema hoặc deploy live.
3. Sau baseline ổn: shared TypeScript contracts/API adapter + Next.js Web từng workflow;legacy tiếp tục chạy.
4. RN/Expo spike riêng phải chứng minh token/draft/pending logout/signed update và minimum OS trước native migration. Không đạt thì trình lại phương án.
5. Staging/production/signing/hosting/backup retention cần phê duyệt riêng khi tới gate;không hỏi tất cả chi tiết hạ tầng trước khi người dùng duyệt M1.

Sau mỗi milestone có ý nghĩa,cập nhật context/tracker và báo file/test/workflow/rủi ro thực tế. Không ghi implemented=verified. Không tự xem nhánh đã merge là phê duyệt kiến trúc. Giữ source/data/permissions và làm task nhỏ có kiểm chứng.
