# Kế hoạch migration Web, Android và iOS

Ngày cập nhật: 20/11/2026 (`Asia/Bangkok`). Baseline: `a8b2d0b`. Trạng thái: **đã hoàn tất kiểm toán/tài liệu M0; chờ người dùng duyệt kiến trúc và M1; chưa rebuild**.

## 1. Mục tiêu và giới hạn

Hiện đại hóa giao diện và cấu trúc mã, giữ nguyên quy trình tồn kho, quyền, dữ liệu, công thức và tính tương thích với client đang hoạt động. Nguồn hành vi chuẩn là `server/`, `web/`, tests hiện tại, `PROJECT_CONTEXT.md` và [checklist F01–F18](CROSS_PLATFORM_AUDIT.md#3-bản-đồ-workflow-và-checklist-parity).

Giai đoạn khởi đầu chỉ sửa tài liệu. Không xóa ứng dụng cũ, thay schema, cài dependencies, scaffold Next/Expo, đổi backend, chạy sync native hoặc deploy. “Được đề xuất” trong tài liệu này không có nghĩa “đã được phê duyệt”.

## 2. Các phương án kiến trúc cần phê duyệt

| Phương án | Thành phần | Lợi ích | Đánh đổi |
| --- | --- | --- | --- |
| A — Chuyển từng bước, khuyến nghị | Giữ API/SQLite; Next.js Web trước; giữ Capacitor vận hành; RN/Expo chỉ qua gate tương thích rồi migrate mobile | Giảm số phần thay đổi cùng lúc; giữ bản cũ để đối chiếu; backend không phải rewrite | Tạm duy trì hai UI, cần bridge token/draft và kiểm cả client cũ/mới |
| B — Thay cả ba client đồng thời | Next.js + RN/Expo + shared packages cùng đợt, backend cũ | Đồng bộ cấu trúc UI sớm | Blast radius lớn; khó tách lỗi API/UI/session; release bị chặn nếu iOS hoặc storage bridge chưa đạt |
| C — Giữ Capacitor dài hạn | Modernize web/component theo React, giữ WebView mobile; đánh giá pipeline bundle phù hợp | Ít rủi ro mất secure storage/WebView draft, reuse UI nhiều nhất | Không đạt UI native RN; cần đo trải nghiệm nhập liệu thực; Next server features không chạy trực tiếp trong WebView offline bundle |

Chọn A nếu mục tiêu là React Native có kiểm soát rủi ro. Nếu spike không đạt bảo toàn phiên/nháp hoặc minimum OS, quay về C hoặc trình quyết định mới; không tự chấp nhận mất dữ liệu/phiên. Không chọn B chỉ để đạt đồng thời ba logo framework.

### 2.1 Web đề xuất

- React + Next.js App Router + TypeScript + Tailwind; shadcn/ui dùng chọn lọc cho dialog/form/table primitives, giữ hiệu quả nhập liệu tiếng Việt và keyboard/touch.
- Next.js là client/UI mới, không phải thay backend inventory. Interactive forms và browser draft ở Client Components; không đưa `node:sqlite`, password hashing hoặc secret vào browser bundle.
- Giai đoạn parity giữ bearer/session policy hiện tại, gọi shared API client; không tự chuyển sang cookie/BFF, OAuth hoặc đổi lifetime. SSR auth/BFF là quyết định riêng nếu có lý do bảo mật/vận hành cụ thể.
- Inventory/snapshot/history/report và ảnh có quyền không dùng shared cache giữa user; không static-cache authenticated response. Sau mutation dùng canonical server result/refetch; không optimistic stock arithmetic làm sai revision.
- Chọn root deploy `apps/web` khi được duyệt. Không cố đóng gói Next.js server vào Capacitor; client Capacitor cũ vẫn dùng `web/` trong giai đoạn chuyển tiếp.

### 2.2 Mobile đề xuất có điều kiện

- Một app React Native/Expo TypeScript cho Android+iOS, UI native riêng; không cố dùng HTML/shadcn trên mobile. Tái sử dụng contracts, API adapters, validation và pure domain functions có test parity.
- Cần development build và native module/config plugin khi bridge storage cũ; Expo Go không đủ chứng minh update từ app Capacitor.
- Giữ app ID/bundle ID, signing identity và API origin khi upgrade. Chuyển token, pending logout, localStorage drafts có version/ownership; không log secret; secure-store failure không tự xóa dữ liệu cũ.
- Chưa chọn SDK/version. Khi spike, khóa bộ Expo/RN/React/Node/JDK/Xcode tương thích và so minimum OS với thiết bị đang dùng. Không tự nâng minimum OS hiện Android24/iOS15.4.
- Manager screens trên native có trong source hiện tại; việc sản phẩm gọi “staff app” không cho phép bỏ quyền/màn manager đang dùng. Nghiệm thu đủ role matrix hoặc xin duyệt thu hẹp.

### 2.3 Shared/backend/database

Giữ `server/http.mjs`, `server/inventory.mjs`, `server/db.mjs`, API routes, stock scale, session table và SQLite trong giai đoạn UI migration. SQLite vẫn là nguồn tồn duy nhất. Không cần đổi PostgreSQL/Supabase chỉ để chạy Next/Expo.

Monorepo được đề xuất vì có hai client mới dùng chung types/validation/API; chưa cần Turborepo nếu pnpm workspace scripts đủ. Thêm đường dẫn, chưa di chuyển legacy:

```text
web/                     # client Capacitor/Web cũ, tiếp tục hoạt động
android/ ios/             # native Capacitor cũ, giữ nguyên
server/                   # API/SQLite cũ, authority nghiệp vụ
apps/web/                 # Next.js mới, chỉ tạo sau duyệt
apps/mobile/              # Expo mới, chỉ tạo sau gate native
packages/contracts/       # TypeScript types + runtime schemas theo API cũ
packages/api-client/      # auth/header/error/retry adapter
packages/domain/          # pure functions đã chứng minh parity, không DB/token
test/                     # regression backend cũ tiếp tục chạy
docs/                     # audit, parity, ADR, release và rollback
```

Types không thay runtime validation. Thêm schema trước ở adapter; backend vẫn validate bằng logic hiện tại. Chỉ share business logic sau khi có fixtures chứng minh input/output không đổi; không chuyển SQL transaction/authorization sang client hoặc viết lại đồng loạt server bằng TS.

### 2.4 Deployment đề xuất

Next.js trên Vercel; Node API trên host/container có disk persistent và lifecycle phù hợp SQLite. Không đặt file DB hiện tại vào Vercel Functions hoặc `/tmp`: tài liệu [Vercel filesystem](https://vercel.com/docs/functions/runtimes#file-system-support) nêu file không chia sẻ giữa instances và không tồn tại bền sau khi instance dừng. Đây là lý do giữ backend riêng, chưa phải quyết định nhà cung cấp.

Web mới sẽ cần HTTPS endpoint thiết bị truy cập được; loopback4170/4171 không phải public backend cho Vercel/mobile. Staging DB và credentials tách production; HTTPS/CORS allowlist explicit cho web staging/production và origin native cũ; không wildcard mọi preview deployment. Nếu thêm preview origin phải có vòng đời và thu hồi rõ ràng.

Chỉ một writer service được kiểm chứng ban đầu; không nhiều bản copy SQLite độc lập, không ghi DB trực tiếp qua network filesystem chưa được kiểm chứng. Chỉ đổi DB/hosting khi số liệu workload/HA thực tế buộc phải làm và được duyệt.

## 3. Các quyết định đang chờ

| Gate | Quyết định | Trạng thái / ảnh hưởng |
| --- | --- | --- |
| G1 | Chọn A/B/C, duyệt giữ backend SQLite và monorepo thêm dần | Chờ phê duyệt; chặn code rebuild |
| G2 | Duyệt M1 baseline/contract tests trước UI migration | Chờ phê duyệt; đây là mốc triển khai đầu khuyến nghị |
| G3 | RN/Expo phù hợp fleet và bảo toàn session/drafts | Chưa có spike; chặn mobile implementation/cutover |
| G4 | Nếu bridge không thể giữ phiên/nháp: phương án chuyển, OS minimum, UX đăng nhập lại | Cần quyết định riêng; không coi login lại/lost draft là chấp nhận mặc định |
| G5 | Offline-first/realtime/approval/export hoặc conflict policy mới | Ngoài parity, chỉ lập spec riêng khi người dùng yêu cầu |
| G6 | Backend host, domain, environment, ký app và production rollout | Chưa xác nhận; phải xin duyệt riêng trước thay live |

## 4. Tracker các milestone và task

Ưu tiên P0=bảo vệ dữ liệu/parity, P1=migration chức năng, P2=tối ưu sau parity. Trạng thái dùng **Hoàn tất**, **Chờ phê duyệt**, **Chưa bắt đầu**, **Chặn**; “Chặn” phải có nguyên nhân/phụ thuộc cụ thể. Mọi đường dẫn chưa tồn tại là dự kiến, không phải file đã tạo.

### M0 — Kiểm toán và thiết lập quy tắc (tài liệu)

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| A01 / chung | Audit stack, workflow, scenarios, toolchain | Không; P0 | `docs/CROSS_PLATFORM_AUDIT.md` | F01–F18 có rules/validation/DB/platform differences; nhãn evidence rõ | Source review,22 API tests,smoke/UI,MCP,ad hoc concurrency | Hoàn tất |
| A02 / docs | Quy tắc tiếng Việt, scope, bảo toàn và tracker | A01; P0 | `AGENTS.md`, `PROJECT_CONTEXT.md`, file này | Không ghi migration đã xong; giữ lịch sử/quyết định cũ | Review chéo docs/source và Git scope | Hoàn tất |
| A03 / architecture | Trình các lựa chọn và mốc đầu | A01–02; P0 | File này §2–3 | Người dùng chọn phương án và phê duyệt M1 | Ghi phản hồi/phạm vi approved vào docs | Chờ phê duyệt G1/G2 |

### M1 — Khóa baseline hành vi và chứng minh rollback (mốc triển khai đầu)

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| T01 / test-business | Lưu concurrency/race tests đã thử và retry ambiguity | G1/G2; P0 | `test/inventory.test.mjs` hoặc `test/concurrency.test.mjs` | Same revision200/409; không overdraw; same-key một receipt; lỗi category không rollback các category đã commit | TDD cho thay đổi nếu phát hiện lỗi; full suite + assertion ledger/balance/request | Chờ phê duyệt |
| T02 / test-cross-platform | Lưu test hai client, stale view, offline draft, recovery và account ownership | T01; P0 | `scripts/smoke-web.mjs` hoặc `test/e2e/` mới, docs parity | Manual refresh thấy số server; stale count bị từ chối; không tự gửi offline; drafts đúng scope; multi-category partial chỉ xóa nháp đã xác nhận, giữ phần chưa gửi | Playwright MCP và committed Playwright dùng memory DB, locale/timezone matrix | Chờ phê duyệt |
| D01 / database | Rehearsal backup/restore và tương thích schema cũ | G1/G2; P0 | `docs/BACKUP_RESTORE.md`, script/test backup, `test/db-compatibility.test.mjs` dự kiến | Bản sao chứa đủ committed WAL state; restore qua integrity/foreign_key check và balance/ledger/docs; fixture schema cũ được hỗ trợ chạy migration không mất dữ liệu và không migrate lặp; không credentials trong log | Disposable file DB qua restart/crash/schema fixtures; không hứa sửa schema hỏng tùy ý; restore riêng, tuyệt đối không overwrite operational | Chờ phê duyệt; backup DB thật cần gate vận hành |
| T03 / baseline | Đóng parity checklist, fixtures chuẩn và evidence map | T01–02,D01; P0 | `docs/FEATURE_PARITY.md`, `docs/TEST_MATRIX.md` dự kiến | Mỗi F01–F18 phân biệt web/Android/iOS/role và hiện có vs đề xuất; zero/blank/unknown, unit, receipts, reports đều có oracle | Full API/browser suite + review không dùng demo kết quả thay physical | Chờ phê duyệt |

M1 chưa cài Next/Expo và không đổi schema. Exit: test baseline được commit, rollback rehearsal dùng dữ liệu thử đạt, danh mục parity đủ; không mở migration UI nếu còn mất draft/ledger chưa hiểu.

### M2 — Shared contracts và Web nền tảng

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| S01 / shared | Workspace bổ sung, contracts và API adapter | M1,G1; P0 | `package.json`, `pnpm-lock.yaml`, workspace config, `packages/contracts/`, `packages/api-client/` | Legacy commands vẫn chạy; header/body/error/status tương thích; schema không siết luật ngoài ý muốn | Contract tests so payload/result/error401/403/409, unknown/null, replay nguyên key | Chặn: M1/G1 |
| S02 / business | Share pure quantity/date/format validation có chọn lọc | S01; P0 | `packages/domain/`, fixtures; server chỉ nếu task riêng cần | Không sai precision,case/each,Atlanta boundaries hoặc report formula | Unit table/property tests đối chiếu implementation cũ; backend integration không đổi | Chặn: S01 |
| W01 / Web | Next/TS/Tailwind/shadcn shell và design tokens | S01; P1 | `apps/web/app/`, components, config, tests | Chạy cạnh legacy; layout manager/staff, tiếng Việt, keyboard/focus/loading/errors/themes; không đọc DB trực tiếp | Typecheck,lint,Next build,Playwright320/390/desktop,accessibility checks | Chặn: S01 |
| W02 / Web-auth | Login/logout/delegation và legacy draft-origin handover | W01,S01; P0 | `apps/web/features/auth/`, storage adapters; legacy export/bridge chỉ khi được duyệt | Web12h,403/401 đúng; manager switch giữ tab; draft ownership; không coi origin mới tự đọc kho cũ | Two-account tests,revocation,refresh,origin transition,secure handling; không secrets SSR/cache | Chặn: W01 |

### M3 — Web đạt feature parity theo từng lát chức năng

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| W03 / Web-count | F02–F06: đếm/nháp/submit nhiều nhóm | W02,S02; P0 | `apps/web/features/counts/`,stock/,tests | Zero/blank/unknown,case conversion,shared name,revision/retry/partial success đều giữ nguyên; không approval mới | Legacy vs new fixtures,concurrent writes,lost response,offline edit,reload,keyboard/focus | Chặn: W02 |
| W04 / Web-stock | F01/F03: catalog,thresholds,system total | W03; P1 | `apps/web/features/catalog/`,stock/ | 5 locations,known semantics,duplicate/item creation/ngưỡng và privileges không đổi | API contract + Playwright theo manager/staff,rows>20,missing unit | Chặn: W03 |
| W05 / Web-documents | F07–F11: NCC/chuyển/ảnh/count linkage | W03; P0 | `apps/web/features/deliveries/`,transfers/,photos/ | Partial/all receipts,batch atomicity,staff creator rules,shortage/overage/link delta0; standalone count mới hơn làm sheet cũ không hợp lệ; giữ khác biệt timestamp supplier/transfer | E2E+integration validate ledger,in-transit,photo permissions,repeat request,409 remaining và eligibility sau standalone count | Chặn: W03 |
| W06 / Web-report | F12–F15: history/report/price/accounts | W04–05; P0 | `apps/web/features/history/`,reports/,accounts/ | Performer/account khác nhau;Atlanta/DST/pagination;đúng report boundaries;USD current value;password reset |22 baseline + new parity E2E,history>50,multiple count same week,revoked two devices | Chặn: W04–05 |
| W07 / UX | Nghiệm thu hiệu suất nhập và accessibility | W03–06; P1 | Web components/tests, `docs/FEATURE_PARITY.md` | Không thêm thao tác thừa; keyboard không che submit; lỗi và pending state rõ; không page overflow | Staff walkthrough,large text,screen reader/focus,weak network,performance measurements | Chặn: W03–06 |

### M4 — Mobile feasibility và native parity

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| N01 / mobile-shared | Spike Expo phù hợp và bridge token/draft/pending logout | M1,G1,phê duyệt spike; P0 | `apps/mobile/` spike riêng, native bridge/config plugin, `docs/adr/` | Không chạm `android/ios` legacy; cùng ID/signing trong controlled upgrade; vault cũ đọc được an toàn hoặc báo không đạt; OS fleet hỗ trợ; đường rollback giữ được sửa đổi nháp và trạng thái auth mới | Android signed in-place update + iOS signed update; offline tombstone, multiple accounts, chuyển storage hai chiều theo rollback path được hỗ trợ. Expo Go không đủ | Chờ M1/G1 và duyệt spike; kết quả N01 là đầu vào xét G3 |
| N02 / Android | Auth/lifecycle và counting native, rồi deliveries/transfers/manager parity | N01 đạt,G3,S01–02; P0 | `apps/mobile/features/`,Android config/tests dự kiến | F01–F15/F18 cho role supported;Keystore,mạng,back,keyboard,camera/picker,permissions,update không mất dữ liệu | Development build+ADB/emulator+physical;Maestro/Detox hoặc tương đương sau chọn;kill/reboot/update/logout/revocation | Chặn: N01 |
| N03 / iOS | Auth/lifecycle và UI native parity | N01 đạt,G3,S01–02; P0 | `apps/mobile/`,iOS config/tests dự kiến | Keychain đúng accessibility,foreground/network,keyboard/safe area,picker,role matrix;không nâng OS âm thầm | Xcode/macOS,Simulator+physical/TestFlight;update signed thực từ legacy,pending logout,draft restoration | Chặn: N01; cần macOS/signing |
| N04 / cross-platform | Cùng API thực trên 3 client trong staging | W06,N02,N03,B01 và duyệt staging tại G6; P0 | E2E/native flows, `docs/TEST_MATRIX.md` | Một thiết bị ghi,hai thiết bị refresh thấy đúng;stale count409,receipt retry không nhân đôi;quyền location giữ | API logs không secret,DB snapshot reconciliation,network interruption trên cả3;ghi binary SHA/origin | Chặn: W06,N02,N03,B01 và staging approval; không cần production approval để test staging |

Các task N02/N03 chia tiếp thành PR auth,counts,deliveries,transfers,manager screens sau spike; không cho phép một PR thay toàn bộ mobile. Nếu chọn C, lập kế hoạch mobile Capacitor thay thế N01–03 và xin duyệt, không ghi chúng là hoàn thành.

### M5 — Deployment staging và sẵn sàng release

| ID / luồng | Mục tiêu | Phụ thuộc / ưu tiên | Files | Nghiệm thu | Xác minh | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| B01 / backend | HTTPS host có persistent disk,auth/CORS/proxy/limits/health | M1,G6,staging approval; P0 | Deployment manifests,server config,runbook dự kiến | Không đổi API/schema;preview không chạm production;single writer,disk permissions,restart handling và login throttle sau proxy đúng | Staging API suite,process restart,disk capacity/lock/load/error tests,photo body limits,health alerts | Chặn: G6 |
| D02 / database | Backup schedule,retention,offsite/restore và ownership | D01,B01,G6; P0 | Backup config/runbook dự kiến | RPO/RTO do chủ vận hành duyệt;backup chứa ảnh/ledger/requests/sessions policy rõ;restore drill đạt | Kiểm integrity,foreign keys,totals,hash counts;drill không overwrite live | Chặn: D01/B01/G6 |
| P01 / Web-deploy | Build Vercel-compatible và preview/staging riêng | W07,B01,G6; P1 | `apps/web/` build/env config,runbook | build/typecheck/lint pass;NEXT_PUBLIC API origin không secret;no auth data shared cache;rollback UI sẵn | Preview E2E,CORS,401/403/409,environment isolation,performance trace | Chặn: W07/B01/G6 |
| P02 / Android-release | Signing/version/env/distribution quy trình | N02,N04,G6; P0 | Mobile build profiles,Android release runbook | Keystore do chủ sở hữu quản lý,versionCode tăng,ID giữ;API production explicit | Signed update physical,offline/reboot/revocation;Play testing channel khi được duyệt | Chặn: signing/G6/N04 |
| P03 / iOS-release | Team/provisioning/version/TestFlight quy trình | N03,N04,G6; P0 | Mobile build profiles,iOS release runbook | Team/cert/provisioning có owner;build tăng;bundle giữ;minimum OS được duyệt | Archive signed,physical update,TestFlight acceptance khi được duyệt | Chặn: Apple account/macOS/G6/N04 |
| P04 / cutover | Pilot rồi rollout có rollback và reconciliation | D02,P01–03,parity sign-off; P0 | `docs/RELEASE_RUNBOOK.md`, `PROJECT_CONTEXT.md` | Người dùng duyệt production cụ thể;không dual-write;không mất giao dịch/nháp;chỉ bỏ legacy sau thời gian chấp nhận | Pilot metrics,error/conflict logs,DB comparison,rollback rehearsal;owner sign-off mỗi nền tảng | Chặn: chưa duyệt production |

### M6 — Tối ưu và công việc ngoài parity

Chỉ sau parity và đo đạc: tối ưu snapshot lớn/SQL/index, list virtualization/native render, bundle web và request waterfalls; không thêm cache làm stale stock. Realtime, offline-first durable outbox, export, approval hoặc quy tắc conflict mới phải có task/spec riêng qua G5. Chuyển PostgreSQL/HA cũng cần workload evidence, schema/data migration plan và phê duyệt riêng.

## 5. Chiến lược kiểm thử và oracle parity

| Nhóm | Baseline phải giữ | Bổ sung sau duyệt | Mức nghiệm thu |
| --- | --- | --- | --- |
| Unit/domain | Quy đổi integer scale1000,each nguyên,price scale10000,date Atlanta | Fixtures số biên,unit thiếu/invalid,zero/blank/unknown,Unicode,DST;compare legacy helper | Kết quả/error tương đương,không chỉ snapshot UI |
| API/DB |22 tests hiện có | Concurrent requests,durable file restart/migrations trên DB cũ bản sao,rollback failure,remaining stale,key mismatch/replay | Balance+revision+ledger+documents+requests đồng nhất sau success/failure |
| Web E2E |smoke + verify-ui | Hai account/browser contexts,partial submit nhiều nhóm,lost response,reload retry,origin drafts,full role matrix | Đúng outcomes và dữ liệu,không chỉ element hiển thị |
| Native |Bằng chứng lịch sử không đủ cho rebuild | Android/iOS storage/lifecycle/signed update,picker permissions,offline foreground,large fonts | Device thực và binary IDs/build/signature/env được ghi,không mock thay physical |
| Synchronization |Cùng API,manual refresh |Web/Android/iOS theo cặp với source/destination khác nhau,stale revisions,timeout khi server đã commit | Không lost update,không duplicate same-key,không hứa realtime |
| Reports/search |Latest/preceding sheet counts,opening fallback,counted receipts,Atlanta history |Same-week/skipped-week,both DST transitions,pagination50/51,empty optional filters,current valuation | So numeric totals,movement boundaries,performer/actor,không so text đơn thuần |
| Persistence/recovery |SQLite file implementation |Consistent backup/restore,restart sau commit,crash/fault injection trên disposable DB | Restore được và reconcile đúng;không thử crash trên live |
| Error/security |401/403/409,rate-limit,photo auth |Expired/revoked token,staff header misuse,invalid payloads,large photo,network loss,disk-full | Server authority không suy yếu,không leak secrets,nháp không bị xóa sai |

Mọi sai khác so với baseline ghi `docs/FEATURE_PARITY.md`: ID workflow,expected,actual,platform/build,evidence,severity,quyết định người duyệt. Không sửa test expected để che sai công thức. Không dùng production như fixture.

## 6. Checkpoint, backup và rollback

1. Baseline code đã có `a8b2d0b`; nhánh tài liệu riêng; 297 staged skills được giữ nguyên. Trước code phase dùng `Minh/<task>` hoặc worktree được chấp thuận; chỉ commit file của task.
2. Chưa có backup operational DB mới trong giai đoạn này. M1 định nghĩa/run rehearsal qua SQLite Online Backup hoặc phương pháp tương đương nhất quán; không copy một file `.sqlite` đang có WAL rồi coi là backup đầy đủ.
3. Giữ ứng dụng cũ và API cũ chạy; rollout UI theo pilot. Cùng một mutation chỉ gửi đến một authoritative API, không shadow-write cả legacy và mới.
4. Code/UI rollback: quay lại legacy client/deployment và cùng backend/data mới nhất. Không restore database cũ để quay giao diện vì sẽ xóa giao dịch mới.
5. Native rollback không thể hứa đơn giản cài APK/IPA version thấp hơn; chuẩn bị forward-fix release với version tăng, hoặc routing/feature flag được thiết kế trước. Không uninstall để rollback vì có thể mất Keystore/draft.
6. Bridge lưu dữ liệu cũ cho đến migration được xác minh; không xóa vault/localStorage trước verify. Sau khi RN sửa nháp, đổi account/token hoặc logout, đường forward-fix quay UI legacy phải đọc trạng thái mới và không phục hồi token, pending logout hoặc nháp đã hết hiệu lực. N01 phải chứng minh compatibility adapter/reverse migration cho rollback path được hỗ trợ; nếu không làm được thì trình giới hạn và xin duyệt trước cutover, không hứa rollback an toàn dựa riêng trên kho cũ.
7. Database restore chỉ dùng cho sự cố dữ liệu, sau approval, dừng writer/cô lập traffic theo runbook, đối soát giao dịch kể từ backup; không âm thầm restore trên live.
8. Mỗi milestone ghi commit/build/env,test results,rollback trigger/owner. Không bỏ legacy ở cùng PR tạo client mới.

## 7. Rủi ro mở và điều kiện sẵn sàng production

- Session-loss trên điện thoại người dùng còn chưa tái hiện; thiết bị/OS/build/install method/backend origin cần xác nhận trước native cutover.
- SecureStore và localStorage khác format/namespace giữa framework/origin. Đây là gate dữ liệu, không phải bước đổi import.
- Authenticated snapshot có thể cũ đến khi refresh; proposal giữ manual refresh. Mọi cải tiến realtime cần phê duyệt.
- Retry key chưa persistent qua app crash; giữ nguyên mức hỗ trợ hiện tại, đo và báo, không hứa exactly-once mọi scenario.
- SQLite local disk cần backup,storage monitoring,load test và host phù hợp; chưa có bằng chứng để kết luận phải thay DB.
- Chưa biết fleet OS,Apple team/Android keystore,production DNS/TLS/host,chi phí,quy trình phân phối và mục tiêu RPO/RTO. Không cần trả lời hết để duyệt M1; bắt buộc giải quyết trước G3/G6.
- iOS current build/physical test cần macOS; kiểm APK/IPA cũ không chứng minh latest HEAD. Source bundles khớp không chứng minh app đã cài cùng config.
- README ghi iOS chưa chạy đã lỗi thời; chưa sửa vì không thuộc allowlist giai đoạn đầu. Handoff đã giải thích bằng chứng lịch sử đúng mức.

## 8. Mốc đầu đề nghị duyệt

**Duyệt phương án A và M1: khóa baseline/parity + backup/rollback rehearsal trên dữ liệu thử.** Deliverables là regression tests và fixtures, contract/parity matrix, quy trình backup restore được chạy trên bản sao; chưa rewrite UI/backend hoặc live deployment.

Sau M1 mới trình phạm vi PR đầu cho `apps/web` và spike native riêng. Không ước lượng lịch ra mắt khi chưa có fleet/signing/hosting và kết quả spike. Người dùng có thể chọn C trước khi dành chi phí cho native rewrite.

## 9. Nhật ký mốc

| Ngày | Mốc | Kết quả |
| --- | --- | --- |
|20/11/2026|Baseline PR#8|22 API tests,history filters/Atlanta/pagination;không đổi production logic|
|20/11/2026|M0 audit|Đã audit source/platform/workflows,run22 API+smoke+UI+MCP,3 concurrency checks;viết AGENTS/context/audit/plan;chưa migrate feature|
|Chờ|G1/G2|Người dùng duyệt kiến trúc và M1;mọi task implementation vẫn chưa bắt đầu|

Nguồn kỹ thuật chính thức và giới hạn bằng chứng nằm ở [audit §9](CROSS_PLATFORM_AUDIT.md#9-nguồn-kỹ-thuật-chính-thức-tham-khảo-ngày-20112026). Khi bắt đầu milestone, xác minh lại phiên bản/tài liệu trước cài đặt.
