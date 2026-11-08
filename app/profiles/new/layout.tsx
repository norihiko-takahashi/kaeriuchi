import { DraftProvider } from "./draft";

export default function NewProfileLayout({
  children,
}: LayoutProps<"/profiles/new">) {
  return <DraftProvider>{children}</DraftProvider>;
}
