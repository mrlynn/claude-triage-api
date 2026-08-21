import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import { storefront } from "../../urls";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import InjectionLab from "@site/src/components/InjectionLab";

export default function InjectionPage(): ReactNode {
  return (
    <Layout
      title="The trust boundary"
      description="Why delimiting untrusted input is necessary and not sufficient, shown rather than asserted."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">The trust boundary</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Every route in this service wraps the customer&rsquo;s message in{" "}
          <code>&lt;customer_message&gt;</code> tags and tells the model that
          the contents are data, not instructions. That is most of the defence
          and it is not the part that fails. The part that fails is that the
          customer can close the tag.
        </p>
        <p style={{ maxWidth: "44rem" }}>
          Toggle the escaping off and watch what the model actually receives.
          Then look at the second payload, where there is no markup to
          neutralize at all &mdash; that one is stopped by arithmetic instead,
          and the difference between those two kinds of defence is the whole
          subject of Lab 8.
        </p>

        <InjectionLab />

        <p style={{ marginTop: "2rem" }}>
          Nothing here calls the API. The escaping is applied in your browser by
          the same rule the service uses, so the structural half of the defence
          is shown with full fidelity. For the behavioural half you need a
          model: the{" "}
          <Link to={storefront("/playground/injection")}>
            live playground on the storefront
          </Link>{" "}
          really classifies, defences on or off.
        </p>
        <p>
          Build the controls yourself in{" "}
          <Link to="/docs/labs/lab-8-trust-boundary">Lab 8</Link>.
        </p>
      </main>
    </Layout>
  );
}
