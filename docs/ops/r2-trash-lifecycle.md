# Cloudflare R2 trash/ lifecycle 运维清单

适用范围：P0.5-B 推送撤回功能会把 R2 对象从原路径移动到 `trash/<原 storage_ref>`。本清单用于给 bucket `fableglitch-assets` 配置 `trash/` 前缀 30 天后自动删除。

## 前置确认

- Cloudflare 账号已启用 R2 Object Storage。
- 目标 bucket 名称为 `fableglitch-assets`。
- 后端环境变量 `R2_BUCKET_NAME` 指向同一个 bucket。
- 当前任务只配置 lifecycle rule，不手动删除任何对象。

## 配置步骤

1. 登录 Cloudflare Dashboard。
2. 进入左侧 **R2 Object Storage**。
3. 打开 bucket **fableglitch-assets**。
4. 进入 bucket 的 **Settings** 或 **Lifecycle rules** 页面。
5. 新建 lifecycle rule。
6. Rule name 填：`delete-trash-after-30-days`。
7. Object prefix 填：`trash/`。
8. Action 选择删除对象。
9. Age / Days after object creation 填：`30` 天。
10. 保存规则。

## 截图说明

配置完成后，请保留一张截图给项目记录。截图里需要能看清：

- bucket 名称：`fableglitch-assets`
- rule name：`delete-trash-after-30-days`
- prefix：`trash/`
- action：delete / expire objects
- days：30

## 验收

- R2 lifecycle rules 列表中能看到 `delete-trash-after-30-days`。
- 规则仅作用于 `trash/` 前缀，不影响正常资产路径。
- 不需要立即验证 30 天删除是否发生；Cloudflare 会按 lifecycle 调度异步执行。

## 回滚

如果误配了规则，进入同一 bucket 的 lifecycle rules 页面，删除或暂停 `delete-trash-after-30-days`。已经被规则删除的对象不能通过 R2 lifecycle 自动恢复。
