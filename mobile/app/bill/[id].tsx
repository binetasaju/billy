// ---------------------------------------------------------------------------
// app/bill/[id].tsx — shared bill links
//
// https://billy-ed9eb.web.app/bill/<id> opens the app here (Android App
// Links); forward to the bill's page.
// ---------------------------------------------------------------------------
import { Redirect, useLocalSearchParams } from "expo-router";

export default function BillLinkRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/group/${id}` as any} />;
}
