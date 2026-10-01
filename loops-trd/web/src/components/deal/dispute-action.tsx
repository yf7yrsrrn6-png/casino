"use client";

import { useState } from "react";
import { Button, Field, Modal, Textarea } from "../ui";
import { useEscrowTx } from "../use-escrow";
import { api } from "@/lib/api";
import type { ActionProps } from "./types";
import { useDealAction } from "./use-action";

export function DisputeAction({ v, refresh, toast }: ActionProps) {
  const d = v.deal;
  const tx = useEscrowTx();
  const { busy, run } = useDealAction({ refresh, toast });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!["funded", "paid"].includes(d.status) || d.frozen) return null;
  const wallet = v.role === "buyer" ? d.buyer_wallet : d.seller_wallet;

  const submit = () =>
    run("Відкриваємо спір…", async () => {
      await tx.ensure(wallet);
      await api(`/api/deals/${d.id}/dispute`, { body: { reason } });
      await tx.escrow.openDispute(v.escrow!, d.chain_deal_id);
      setOpen(false);
    }, "Спір відкрито. Модератор зв'яжеться в чаті.");

  return (
    <>
      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Відкрити спір
        </Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Відкрити спір">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Кошти залишаться в ескроу. Модератор розгляне ситуацію і дасть рекомендацію, остаточне рішення — за адміністратором. Спершу спробуйте
            домовитися в чаті.
          </p>
          <Field label="Що сталося?" hint="Коли й скільки переказали, з якої картки, що відповідає інша сторона.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
          <Button variant="danger" className="w-full" loading={!!busy} disabled={reason.trim().length < 5} onClick={submit}>
            Відкрити спір
          </Button>
        </div>
      </Modal>
    </>
  );
}
