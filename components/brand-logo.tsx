import Image from "next/image";

export default function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src="/wemry-logo.png"
      alt="WemryOS for Business"
      width={1254}
      height={1254}
      sizes="160px"
      loading="eager"
    />
  );
}
