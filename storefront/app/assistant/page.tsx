import AssistantChat from "@/components/AssistantChat";
import NorthwindAssistantMark from "@/components/NorthwindAssistantMark";

export const metadata = { title: "Ask Northwind | Northwind Outfitters" };

export default function AssistantPage() {
  return (
    <>
      <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
        <NorthwindAssistantMark size={34} className="shrink-0" />
        Ask Northwind
      </h1>
      <p className="mt-2 max-w-2xl text-pine/70">
        Get unstuck in the workshop or ask the fictional support desk about an order.
      </p>
      <div className="mt-8">
        <AssistantChat fullPage />
      </div>
    </>
  );
}
