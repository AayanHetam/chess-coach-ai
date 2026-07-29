import dynamic from "next/dynamic";

const Test3DLanding = dynamic(
  () => import("@/components/test-3d/Test3DLanding"),
  {
    ssr: false,
  },
);

export default function Test3DPage() {
  return <Test3DLanding />;
}
