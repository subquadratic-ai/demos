import customers from "../../data/customers.json";
import scenarios from "../../data/scenarios.json";
import { SupportDesk } from "../components/support-desk";
import { parseCatalog } from "../lib/catalog";

export default function Home() {
  const catalog = parseCatalog(scenarios, customers);
  return <SupportDesk catalog={catalog} />;
}
