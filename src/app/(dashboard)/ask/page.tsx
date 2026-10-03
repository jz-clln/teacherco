import { AskWorkspace } from "@/features/ask/ask-workspace";
import { getAskClassOptions } from "@/features/ask/queries";

export const metadata = { title: "Ask" };

export default async function AskPage() {
	const result = await getAskClassOptions();
	return <AskWorkspace classes={result.classes} loadError={result.error} />;
}
