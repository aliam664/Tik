import { useEffect, useState } from "react";
import { Crown, Medal, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TierBadge } from "@/components/ui/Coin";
import { EmptyState, ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import type { LeaderboardRow } from "@/types/api";

export function LeaderboardPage() {
  useDocumentTitle("رده‌بندی | دوز آنلاین");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getLeaderboard("season", 50, 0);
      setRows(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(toUserError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <section className="card">
        <div className="lb-head">
          <div>
            <h1 className="card__title">
              <Trophy size={22} aria-hidden="true" /> جدول رده‌بندی
            </h1>
            <p className="card__sub">
              ۱۰۰ بازیکن برتر فصل جاری — حداقل ۲۰ بازی رسمی برای حضور در جدول لازم است.
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void load()}>
            تازه‌سازی
          </Button>
        </div>

        {loading ? (
          <LoadingSpinner size={26} label="در حال بارگذاری رده‌بندی" />
        ) : error ? (
          <ErrorState title="خطا در دریافت رده‌بندی" description={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="هنوز بازیکنی در جدول نیست"
            description="پس از ۲۰ بازی رنکد، نفرات برتر این‌جا نمایش داده می‌شوند."
          />
        ) : (
          <div className="lb-table">
            <div className="lb-row lb-row--head">
              <span>رتبه</span>
              <span>بازیکن</span>
              <span>تیر</span>
              <span>امتیاز</span>
              <span>برد / باخت / مساوی</span>
            </div>
            {rows.map((r) => (
              <div key={r.rank} className={`lb-row ${r.rank <= 3 ? `lb-row--top${r.rank}` : ""}`}>
                <span className="lb-row__rank ltr">
                  {r.rank === 1 ? (
                    <Crown size={17} aria-hidden="true" />
                  ) : r.rank <= 3 ? (
                    <Medal size={15} aria-hidden="true" />
                  ) : null}
                  {toFaDigits(r.rank)}
                </span>
                <span className="lb-row__name">{r.display_name}</span>
                <span>
                  <TierBadge tier={r.tier} compact />
                </span>
                <span className="lb-row__rating ltr">{toFaDigits(r.rating)}</span>
                <span className="lb-row__wld ltr">
                  {toFaDigits(r.wins)} / {toFaDigits(r.losses)} / {toFaDigits(r.draws)}
                </span>
              </div>
            ))}
            <p className="lb-foot">مجموع بازیکنان واجد شرایط: {toFaDigits(total)}</p>
          </div>
        )}
      </section>
    </div>
  );
}
