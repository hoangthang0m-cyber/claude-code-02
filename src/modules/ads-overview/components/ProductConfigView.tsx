"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  addCurrencyRate,
  createProduct,
  deleteCurrencyRate,
  deleteProduct,
  getReportConfig,
  setAccountRules,
  setCampaignOverride,
  updateProduct,
  updateReportingCurrency,
  type ReportConfig,
} from "@/modules/ads-overview/services/adsReporting.client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ProductConfigView() {
  const [config, setConfig] = React.useState<ReportConfig | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)
  const reload = () => setTick((t) => t + 1)

  React.useEffect(() => {
    let cancelled = false
    getReportConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [tick])

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thất bại")
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!config) return <p className="text-sm text-muted-foreground">Đang tải…</p>

  const productName = (id: string) =>
    config.products.find((p) => p.id === id)?.name ?? id

  return (
    <div className="flex flex-col gap-8">
      {/* products */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Sản phẩm</h2>
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-16">Mã</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Từ khoá (phẩy)</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                onSave={(name, keywords) =>
                  run(updateProduct(p.id, { name, keywords }), "Đã lưu sản phẩm")
                }
                onDelete={() => run(deleteProduct(p.id), "Đã xoá sản phẩm")}
              />
            ))}
            <NewProductRow
              onCreate={(code, name, keywords) =>
                run(createProduct({ code, name, keywords }), "Đã thêm sản phẩm")
              }
            />
          </TableBody>
        </Table>
      </section>

      {/* account → product rules */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Gán tài khoản → sản phẩm</h2>
        {config.accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa kết nối tài khoản quảng cáo nào.
          </p>
        )}
        {config.accounts.map((acc) => (
          <AccountRuleRow
            key={acc.ad_account_id}
            account={acc}
            products={config.products}
            rules={config.rules.filter(
              (r) => r.ad_account_id === acc.ad_account_id
            )}
            onSave={(productIds, defaultId) =>
              run(
                setAccountRules({
                  ad_account_id: acc.ad_account_id,
                  product_ids: productIds,
                  default_product_id: defaultId,
                }),
                "Đã lưu gán tài khoản"
              )
            }
          />
        ))}
      </section>

      {/* manual campaign overrides */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Gán tay campaign</h2>
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Tài khoản</TableHead>
              <TableHead>Campaign ID</TableHead>
              <TableHead>Sản phẩm</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.overrides.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.ad_account_id}</TableCell>
                <TableCell>{o.campaign_id}</TableCell>
                <TableCell>{productName(o.product_id)}</TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      run(
                        setCampaignOverride({
                          ad_account_id: o.ad_account_id,
                          campaign_id: o.campaign_id,
                          product_id: null,
                        }),
                        "Đã bỏ gán tay"
                      )
                    }
                  >
                    Bỏ
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <NewOverrideRow
              accounts={config.accounts}
              products={config.products}
              onCreate={(adAccountId, campaignId, productId) =>
                run(
                  setCampaignOverride({
                    ad_account_id: adAccountId,
                    campaign_id: campaignId,
                    product_id: productId,
                  }),
                  "Đã gán tay campaign"
                )
              }
            />
          </TableBody>
        </Table>
      </section>

      {/* reporting currency + rates */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Tiền tệ báo cáo</h2>
        <CurrencyInput
          value={config.reporting_currency}
          onSave={(c) =>
            run(updateReportingCurrency(c), "Đã đổi tiền tệ báo cáo")
          }
        />
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Từ</TableHead>
              <TableHead>Sang</TableHead>
              <TableHead>Tỷ giá</TableHead>
              <TableHead>Áp dụng từ</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.currency_rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.from_currency}</TableCell>
                <TableCell>{r.to_currency}</TableCell>
                <TableCell>{r.rate}</TableCell>
                <TableCell>{r.effective_from}</TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      run(deleteCurrencyRate(r.id), "Đã xoá tỷ giá")
                    }
                  >
                    Xoá
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <NewRateRow
              onCreate={(body) => run(addCurrencyRate(body), "Đã thêm tỷ giá")}
            />
          </TableBody>
        </Table>
      </section>
    </div>
  )
}

// ── small row editors ────────────────────────────────────────────────────

function ProductRow({
  product,
  onSave,
  onDelete,
}: {
  product: { code: string; name: string; keywords: string[] }
  onSave: (name: string, keywords: string[]) => void
  onDelete: () => void
}) {
  const [name, setName] = React.useState(product.name)
  const [kw, setKw] = React.useState(product.keywords.join(", "))
  return (
    <TableRow>
      <TableCell className="font-mono">{product.code}</TableCell>
      <TableCell>
        <Input
          className="h-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
      </TableCell>
      <TableCell className="flex gap-1">
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            onSave(
              name.trim(),
              kw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        >
          Lưu
        </Button>
        <Button size="xs" variant="ghost" onClick={onDelete}>
          Xoá
        </Button>
      </TableCell>
    </TableRow>
  )
}

function NewProductRow({
  onCreate,
}: {
  onCreate: (code: string, name: string, keywords: string[]) => void
}) {
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [kw, setKw] = React.useState("")
  return (
    <TableRow>
      <TableCell>
        <Input
          className="h-8 w-14"
          maxLength={1}
          placeholder="a"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          placeholder="Tên sản phẩm mới"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          placeholder="hmdc, ..."
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Button
          size="xs"
          disabled={!code.trim() || !name.trim()}
          onClick={() => {
            onCreate(
              code.trim(),
              name.trim(),
              kw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
            setCode("")
            setName("")
            setKw("")
          }}
        >
          Thêm
        </Button>
      </TableCell>
    </TableRow>
  )
}

function AccountRuleRow({
  account,
  products,
  rules,
  onSave,
}: {
  account: { ad_account_id: string; name: string }
  products: Array<{ id: string; name: string }>
  rules: Array<{ product_id: string; is_account_default: boolean }>
  onSave: (productIds: string[], defaultId: string | null) => void
}) {
  const [selected, setSelected] = React.useState<string[]>(
    rules.map((r) => r.product_id)
  )
  const [defaultId, setDefaultId] = React.useState<string | null>(
    rules.find((r) => r.is_account_default)?.product_id ?? null
  )
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    )

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {account.name}{" "}
        <span className="text-xs text-muted-foreground">
          ({account.ad_account_id})
        </span>
      </p>
      <div className="flex flex-wrap gap-3">
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)}
            />
            {p.name}
            {selected.includes(p.id) && (
              <button
                type="button"
                className={`ml-1 rounded px-1 text-xs ${
                  defaultId === p.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
                onClick={() => setDefaultId(p.id)}
              >
                mặc định
              </button>
            )}
          </label>
        ))}
        <Button
          size="xs"
          variant="outline"
          disabled={selected.length === 0}
          onClick={() =>
            onSave(
              selected,
              defaultId && selected.includes(defaultId) ? defaultId : selected[0]
            )
          }
        >
          Lưu
        </Button>
      </div>
    </div>
  )
}

function NewOverrideRow({
  accounts,
  products,
  onCreate,
}: {
  accounts: Array<{ ad_account_id: string; name: string }>
  products: Array<{ id: string; name: string }>
  onCreate: (adAccountId: string, campaignId: string, productId: string) => void
}) {
  const [acc, setAcc] = React.useState(accounts[0]?.ad_account_id ?? "")
  const [campaign, setCampaign] = React.useState("")
  const [product, setProduct] = React.useState(products[0]?.id ?? "")
  return (
    <TableRow>
      <TableCell>
        <select
          className="h-8 rounded border bg-background px-1 text-sm"
          value={acc}
          onChange={(e) => setAcc(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.ad_account_id} value={a.ad_account_id}>
              {a.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          placeholder="123456789"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <select
          className="h-8 rounded border bg-background px-1 text-sm"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Button
          size="xs"
          disabled={!acc || !campaign.trim() || !product}
          onClick={() => {
            onCreate(acc, campaign.trim(), product)
            setCampaign("")
          }}
        >
          Gán
        </Button>
      </TableCell>
    </TableRow>
  )
}

function CurrencyInput({
  value,
  onSave,
}: {
  value: string
  onSave: (c: string) => void
}) {
  const [v, setV] = React.useState(value)
  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-8 w-24"
        maxLength={3}
        value={v}
        onChange={(e) => setV(e.target.value.toUpperCase())}
      />
      <Button
        size="xs"
        variant="outline"
        disabled={v.length !== 3 || v === value}
        onClick={() => onSave(v)}
      >
        Lưu
      </Button>
    </div>
  )
}

function NewRateRow({
  onCreate,
}: {
  onCreate: (body: {
    from_currency: string
    to_currency: string
    rate: number
    effective_from: string
  }) => void
}) {
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [rate, setRate] = React.useState("")
  const [date, setDate] = React.useState("")
  const ready =
    from.length === 3 && to.length === 3 && Number(rate) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
  return (
    <TableRow>
      <TableCell>
        <Input
          className="h-8 w-20"
          maxLength={3}
          placeholder="USD"
          value={from}
          onChange={(e) => setFrom(e.target.value.toUpperCase())}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-20"
          maxLength={3}
          placeholder="VND"
          value={to}
          onChange={(e) => setTo(e.target.value.toUpperCase())}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-28"
          type="number"
          placeholder="25000"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-40"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Button
          size="xs"
          disabled={!ready}
          onClick={() => {
            onCreate({
              from_currency: from,
              to_currency: to,
              rate: Number(rate),
              effective_from: date,
            })
            setRate("")
          }}
        >
          Thêm
        </Button>
      </TableCell>
    </TableRow>
  )
}
