import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

function Logo() {
  return (
    <img
      src="/brand/vaeltrix-mark.svg"
      alt="Vaeltrix"
      className="h-6 w-auto rounded-md"
      aria-hidden="true"
    />
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2.5 font-semibold tracking-tight text-white">
          <Logo />
          <span>Vaeltrix Docs</span>
        </span>
      ),
    },
    links: [
      {
        text: "Playground",
        url: "https://vaeltrix-testnet.vercel.app",
      },
      {
        text: "Website",
        url: "https://www.vaeltrix.xyz",
      },
      {
        text: "GitHub",
        url: "https://github.com/Vaeltrix-SCF/vaeltrix-contracts",
      },
    ],
  };
}
