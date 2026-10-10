"use client";
// Shows the plan at the top of every screen, and explains how to upgrade.
// There is no checkout here on purpose: billing arrives only through the Stripe
// webhook, so the dialog tells the recruiter what happens instead of faking a payment.
import { useRef } from "react";
import { usePlan } from "@/lib/plan";
import { BoltIcon, CheckCircleIcon } from "./icons";

export function PlanBadge({ company }: { company: string }) {
  const { plan } = usePlan();
  const dialog = useRef<HTMLDialogElement>(null);
  if (!plan) return <div className="plan-bar" />;

  if (plan.plan === "paid") {
    return (
      <div className="plan-bar">
        <span className="plan-paid">
          <CheckCircleIcon /> Paid plan, unlimited searches
        </span>
      </div>
    );
  }

  const left = plan.searches_remaining ?? 0;
  return (
    <div className="plan-bar">
      <span className="plan-pill">
        <BoltIcon /> {left > 0 ? `Free plan: ${left} search left` : "Free search used"}
      </span>
      <button type="button" className="btn-quiet" onClick={() => dialog.current?.showModal()}>
        Upgrade
      </button>

      <dialog ref={dialog} className="modal" aria-labelledby="upgrade-title">
        <h2 id="upgrade-title" className="display">
          {left > 0 ? "Upgrade for unlimited searches" : "Upgrade to keep searching"}
        </h2>
        <p>
          {company}&apos;s free plan includes 1 search{left > 0 ? "." : ", and it's been used."} Paging through results,
          opening profiles, shortlisting and saving searches are always free.
        </p>
        <div className="plan-compare">
          <div className="plan-option">
            <span className="muted">Free, your plan</span>
            <strong>1 search in total</strong>
          </div>
          <div className="plan-option plan-option-best">
            <span className="muted">Paid</span>
            <strong>
              <span className="mk">Unlimited</span> searches
            </strong>
          </div>
        </div>
        <p className="muted">
          Your company subscribes through Stripe. Searching unlocks here on its own as soon as the subscription is active.
        </p>
        <form method="dialog" className="modal-actions">
          <button className="btn">Got it</button>
        </form>
      </dialog>
    </div>
  );
}