import type { LabRow } from "@/lib/adminData";
import { Meter, Table, num, pct } from "./ui";

/** Per-lab review outcomes, in course order. Shared by the learning page and a learner's page. */
export function LabTable({ rows, showLearners = true }: { rows: LabRow[]; showLearners?: boolean }) {
  return (
    <Table
      rows={rows}
      rowKey={(r) => r.labId}
      empty="No Tutor reviews in this window."
      columns={[
        { label: "Lab", cell: (r) => <span title={r.labId}>{r.title}</span> },
        ...(showLearners ? [{ label: "Learners", cell: (r: LabRow) => num(r.learners), align: "right" as const }] : []),
        { label: "Reviews", cell: (r) => num(r.reviews), align: "right" },
        {
          label: "Pass rate",
          cell: (r) => (
            <>
              <Meter value={r.passes} of={r.reviews} invert warnAt={0.5} /> {pct(r.passes, r.reviews)}
            </>
          ),
          align: "right",
        },
        { label: "Criteria met", cell: (r) => pct(r.met, r.criteria), align: "right" },
        { label: "Missing", cell: (r) => num(r.missing), align: "right" },
        { label: "Incorrect", cell: (r) => num(r.incorrect), align: "right" },
      ]}
    />
  );
}
