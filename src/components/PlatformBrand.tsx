import { productBrand } from '../domain/brand';

export function PlatformBrand({
  prominent = false,
  href = '/',
  transparent = false,
}: {
  prominent?: boolean;
  href?: string;
  transparent?: boolean;
}) {
  return (
    <a
      className={`platform-brand${prominent ? ' platform-brand--prominent' : ''}`}
      href={href}
      aria-label={`${productBrand.name} home`}
    >
      <img
        src={
          transparent ? productBrand.transparentPortalLogo : productBrand.logo
        }
        alt={productBrand.name}
        width="2172"
        height="724"
      />
    </a>
  );
}
