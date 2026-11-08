"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, API_URL, type ModelInfo } from "@/lib/api";

export function ModelPanel() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = () => api.info().then(setInfo).catch((e) => setError(e.message));
  const load = () => {
    setError(null);
    fetchInfo();
  };
  useEffect(() => {
    fetchInfo();
  }, []);

  if (error)
    return (
      <Alert variant="destructive" className="rounded-none border-2 border-rose-700 bg-rose-50">
        <AlertTitle className="font-display uppercase">Couldn&apos;t load model info</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-2">
          {error}
          <Button size="sm" className="btn-retro" onClick={load}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  if (!info) return <Skeleton className="bevel h-72 w-full rounded-none" />;

  const m = info.valid_metrics, b = info.baseline_valid_metrics;
  const rows: [string, number, number, number][] = [
    ["ROC AUC (REAL VS FAKE)", b.valid_auc, m.valid_auc, 0.5],
    ["ACCURACY AT 0.5", b.valid_accuracy, m.valid_accuracy, 0.5],
    ["FILL-IN-THE-BLANK (1 OF 4)", b.valid_fitb_accuracy, m.valid_fitb_accuracy, 0.25],
  ];
  const half = (info.n_train_outfits / 2).toLocaleString();
  const name = info.model_name.replaceAll("_", " ").toUpperCase();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bevel flex flex-col gap-3 p-3">
        <h2 className="title-plate font-pixel self-start px-3 py-0.5 text-2xl leading-none">REPORT CARD</h2>
        <div className="lcd overflow-x-auto p-3">
          <table className="w-full min-w-[360px] text-xl leading-tight">
            <thead className="opacity-70">
              <tr>
                <th className="pb-1 text-left font-normal">METRIC</th>
                <th className="pb-1 text-right font-normal">CHANCE</th>
                <th className="pb-1 text-right font-normal">BASELINE</th>
                <th className="pb-1 text-right font-normal">MODEL</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map(([label, base, model, chance]) => (
                <tr key={label} className="border-t border-[rgb(143_243_255/0.25)]">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right opacity-70">{chance.toFixed(2)}</td>
                  <td className="py-1.5 text-right">{base.toFixed(3)}</td>
                  <td className="py-1.5 text-right text-[#7dff9a]">{model.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-snug">
          Validation split of Polyvore Outfits (disjoint: no items shared with training). The test split is held
          back for the final report. Baseline = logistic regression on the outfit&apos;s category mix only; fake
          outfits have the same mix as real ones, so it sits at chance.
        </p>
      </section>

      <section className="bevel flex flex-col gap-3 p-3">
        <h2 className="title-plate font-pixel self-start px-3 py-0.5 text-2xl leading-none">SYSTEM INFO</h2>
        <dl className="bevel-in font-pixel grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-3 text-xl leading-tight">
          <Row k="MODEL" v={name} />
          <Row k="PIPELINE" v={info.pipeline_steps.join(" → ").toUpperCase()} />
          <Row k="FEATURES" v={`${info.n_features} PER OUTFIT`} />
          <Row k="TRAINED ON" v={`${half} REAL + ${half} FAKE`} />
          <Row k="CATALOG" v={`${info.catalog_size.toLocaleString()} UNSEEN ITEMS`} />
          <Row k="SKLEARN" v={info.sklearn_version} />
          <Row k="TRAINED" v={new Date(info.trained_at).toLocaleString()} />
          <dt className="text-[var(--lo)]">API</dt>
          <dd className="break-all">
            <a className="underline" href={`${API_URL}/docs`} target="_blank" rel="noreferrer">{API_URL}/docs</a>
          </dd>
        </dl>
        <p className="text-xs leading-snug">
          The score means &ldquo;looks like an outfit a Polyvore user (mostly women&apos;s, mid-2010s) would make.&rdquo;
          It doesn&apos;t measure your taste, the preference controls aren&apos;t learned, and the dress-up figure is
          a cut-out preview, not a fit simulation.
        </p>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--lo)]">{k}</dt>
      <dd className="break-words">{v}</dd>
    </>
  );
}
