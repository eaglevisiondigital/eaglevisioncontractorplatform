import { productBrand } from '../domain/brand';

export function PlatformBrand({
  prominent = false,
  href = '/',
}: {
  prominent?: boolean;
  href?: string;
}) {
  return (
    <a
      className={`platform-brand${prominent ? ' platform-brand--prominent' : ''}`}
      href={href}
      aria-label={`${productBrand.name} home`}
    >
      <img
        src={productBrand.logo}
        alt={productBrand.name}
        width="2172"
        height="724"
      />
    </a>
  );
}
