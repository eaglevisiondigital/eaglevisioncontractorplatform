import { modules } from '../domain/platform';
import { BackOfficeText } from './property/back-office-copy';

/** The existing module inventory and gates; presentation never authorizes access. */
export function WorkspaceNavigation({
  platform,
  sample,
  section,
  onSection,
}: {
  platform: boolean;
  sample: boolean;
  section: string;
  onSection(name: string): void;
}) {
  return (
    <nav aria-label="Workspace">
      {(platform
        ? ['Organizations', 'Access & security', 'Module readiness', 'Activity']
        : modules
            .filter(
              (m) =>
                m.phase === 1 &&
                (sample || !('previewOnly' in m && m.previewOnly)),
            )
            .map((m) => m.name)
      ).map((name, i) => (
        <button
          key={name}
          aria-current={section === name ? 'page' : undefined}
          className={
            section === name || (platform && section === 'Overview' && i === 0)
              ? 'active'
              : ''
          }
          onClick={() => onSection(name)}
        >
          <span aria-hidden="true">
            {['◈', '▦', '↗', '≡', '▤', '▧', '○', '▣', '⚙'][i]}
          </span>
          <BackOfficeText text={name} />
          {!platform &&
            (modules.find((m) => m.name === name)?.phase ?? 1) > 1 && (
              <small>SOON</small>
            )}
        </button>
      ))}
    </nav>
  );
}
