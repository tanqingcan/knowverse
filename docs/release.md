# 发布与回滚

2026-11-17。本文件是可执行的交付流程；本轮只完成本地修改和验收，尚未推送、创建 tag / Release、修改远程 main 规则或观察 GitHub CI 运行结果。发布版本号由合并后确定，不预先宣称 v1.0.0 已发布。

## CI 与合并

`.github/workflows/ci.yml` 在 PR、main push 或手动触发时运行；Node 22 + PostgreSQL 16 service，依次 `npm ci`、typecheck、全量 Vitest、生产 build。依赖安装失败、类型错误、测试失败、构建失败有独立步骤可定位。最低令牌权限为 contents:read，无部署或外发消息步骤。

测试自动创建固定本机 `knowverse_test`，reset → migrate → seed；保留环境变量中的应用角色连接为 `TEST_APP_DATABASE_URL`，不依赖开发者的 `.env`。PostgreSQL 启动后开启 logical WAL 并重启，避免 CDC 用例悄悄走未验证分支。

官方配置参考：[PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)、[setup-node](https://github.com/actions/setup-node)、[checkout](https://github.com/actions/checkout)。

仓库管理员在实际 CI 绿灯后配置 main ruleset：必须 PR、至少 1 人 approval、必须通过 `typecheck-test-build`、禁止 force push 与删除。若仓库计划/权限不支持，需要记下限制并由团队执行人工双人审阅。**本地不能证明远程规则已启用**。

## 发布前验收

先在独立本机库运行，禁止直接 reset 有需保留数据的业务库。以下 PowerShell 设置只影响当前终端；不会写入 `.env`。

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/knowverse_test'
$env:APP_DATABASE_URL='postgres://kv_app:kv_app_dev@localhost:5432/knowverse_test'
npm run db:reset
npm run verify:invariants
npm run security:audit
npm test
npm run typecheck
npm run build
```

不变量检查要在**干净种子库**执行。测试会故意制造坏状态来验证审计/修复，完成后留下的 fixture 不保证满足业务不变量；不能在全套测试之后直接把同库的漂移当成生产缺陷。也不要删掉这些测试来让审计变绿。`security:audit` 的 S6 只是列出 SQL 模板插值，仍需人工检查，本轮 `memories.ts` 的插值均为服务端固定列名/条件片段，值继续参数化。

浏览器验收见 `qa-checklist.md`；运行时显式 `LLM_MODE=demo`，真实模型评测另行授权运行。发布时确保配置 `APP_DATABASE_URL`，不要让生产请求使用数据库所有者。`.env`、上传文件、`.next` 和本地数据库均不提交。

## 数据与版本

迁移截至 `0031_default_timezone`（32 个 journal 条目），禁止改写 0000–0030；0031 将用户默认时区及旧版 Asia/Taipei 值统一为 Asia/Shanghai，不影响其它已选时区。favicon 使用 `src/app/icon.svg`，Next 构建已产出该路由。

迁移前用部署环境可用的 `pg_dump` 做备份，并在独立库验证恢复；本地 embedded-postgres 未捆绑 pg_dump，不能把“命令示例”当作已完成的生产备份。基准库旧状态已通过 PostgreSQL TEMPLATE 备份为 `knowverse_bench_backup_1794886549104`，随后仅重建 `knowverse_bench`，未 reset 业务库。

`npm run bench` 默认仅替换 fixture 账号的数据；本机库名固定为 knowverse_bench。旧版 explain 库迁移 journal 不兼容时，才可设置 `$env:BENCH_REBUILD='1'`：脚本先建 TEMPLATE 完整备份，失败则停止，再清理该基准库的 public/drizzle schema。执行后 `Remove-Item Env:BENCH_REBUILD`。这不是业务数据库重置入口。

合并 PR 后再对最终提交打 tag，Release notes 记录功能、迁移范围、验收输出、demo 模式边界和已知问题。发布前再次确认没有真实个人数据或密钥。

## 回滚与恢复

应用代码：对确认有问题的提交/合并执行 `git revert`，重新走 PR 与 CI；不要对已共享的 main 执行 reset / force push。合并提交需确认主父节点后再使用 `git revert -m 1 <merge>`。

数据库：保留已执行迁移，通过新的 0032+ 向前修复。0031 若需改回默认值，新增迁移只调整未来用户默认值；不要对所有用户批量倒改时区，因为发布后用户可能已经修改偏好。若故障涉及数据损坏，停止写入、恢复迁移前备份到独立库、核对后切换连接，写清恢复点之后的数据损失范围。

## 本轮状态

本地代码/文档、248 例回归、构建、干净库安全审计已验证；CI 配置已落盘。远程 CI 绿灯、main 保护、正式 tag / Release、生产备份恢复演练仍是发布前需要实际执行并记录的步骤。

0031 也已成功应用到现有本机 knowverse，未 reset/seed。迁移后不变量 0 错误、1 条 outbox 积压警告（2026-11-16 起的成长事件），安全自查 0 失败。发布前应确认 outbox 消费与告警策略；当前目标仅为服务端日志，不能宣称已接入外部通知。
