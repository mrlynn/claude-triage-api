import AssistantChat from "@/components/AssistantChat";
export const metadata = { title: "Ask Northwind | Northwind Outfitters" };
export default function AssistantPage() { return <><h1 className="text-3xl font-extrabold tracking-tight">Ask Northwind</h1><p className="mt-2 max-w-2xl text-pine/70">Get unstuck in the workshop or ask the fictional support desk about an order.</p><div className="mt-8"><AssistantChat fullPage /></div></>; }
