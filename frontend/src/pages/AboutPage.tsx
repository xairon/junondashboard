import { Info, Database, FlaskConical, ExternalLink, GitBranch } from 'lucide-react'

const DATA_SOURCES = [
  {
    name: "Hub'Eau — BRGM",
    description: "Données piézométriques (eaux souterraines) et hydrométriques (eaux de surface) via l'API nationale du BRGM.",
    url: 'https://hubeau.eaufrance.fr/',
  },
  {
    name: 'SANDRE',
    description: 'Référentiels hydrographiques : zones hydrographiques, cours d\'eau Carthage, masses d\'eau DCE (services WFS).',
    url: 'https://www.sandre.eaufrance.fr/',
  },
  {
    name: 'ERA5 — ECMWF',
    description: 'Réanalyse climatique : température, précipitations et évapotranspiration à résolution spatiale fine.',
    url: 'https://cds.climate.copernicus.eu/',
  },
  {
    name: 'BDLISA',
    description: 'Base de Données des Limites des Systèmes Aquifères — référentiel national des masses d\'eau souterraines.',
    url: 'https://bdlisa.eaufrance.fr/',
  },
  {
    name: 'Limites administratives',
    description: 'Contours des régions, départements et bassins hydrographiques (données ouvertes IGN / data.gouv.fr).',
    url: 'https://www.data.gouv.fr/',
  },
]

const METHODOLOGY = [
  {
    name: 'SPLI (IPS)',
    full: 'Standardized Piezometric Level Index',
    description: 'Indice standardisé du niveau piézométrique, calculé par estimation de densité par noyau (KDE) par mois calendaire. Méthodologie BRGM (RP-64147-FR).',
  },
  {
    name: 'SSFI',
    full: 'Standardized Streamflow Index',
    description: 'Indice standardisé du débit, basé sur un ajustement par distribution gamma par mois calendaire.',
  },
  {
    name: 'SPI',
    full: 'Standardized Precipitation Index',
    description: 'Indice standardisé de précipitations (distribution gamma). Affiché en complément du SPLI/SSFI sur les fiches stations.',
  },
]

const CLASSIFICATION_CLASSES = [
  { label: 'Extrêmement bas', threshold: '< -1.75σ', color: '#7f1d1d' },
  { label: 'Très bas', threshold: '-1.75 à -1.28σ', color: '#dc2626' },
  { label: 'Bas', threshold: '-1.28 à -0.84σ', color: '#f97316' },
  { label: 'Normal', threshold: '-0.84 à 0.84σ', color: '#16a34a' },
  { label: 'Haut', threshold: '0.84 à 1.28σ', color: '#2563eb' },
  { label: 'Très haut', threshold: '1.28 à 1.75σ', color: '#1e3a8a' },
  { label: 'Extrêmement haut', threshold: '> 1.75σ', color: '#312e81' },
]


function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-card border border-white/5 rounded-xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
        <Icon className="w-4 h-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-accent-cyan" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">À propos</h1>
            <p className="text-xs text-text-secondary">
              Observatoire Hydrologique France — suivi des eaux souterraines et de surface
            </p>
          </div>
        </div>

        {/* Présentation */}
        <SectionCard icon={Info} title="Le projet">
          <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              L'Observatoire Hydrologique France est un tableau de bord interactif pour le suivi en temps
              quasi-réel des niveaux piézométriques (eaux souterraines) et des débits hydrométriques
              (eaux de surface) sur l'ensemble du territoire métropolitain.
            </p>
            <p>
              Il agrège les données de plus de 18 000 stations piézométriques et 5 000 stations
              hydrométriques, calcule des indices de sécheresse standardisés (SPLI, SSFI, SPI)
              et les classe selon la grille à 7 niveaux de Météo-France / BRGM.
            </p>
            <p>
              L'objectif est de fournir un outil libre, transparent et accessible pour la surveillance
              de la ressource en eau, à destination des professionnels de l'environnement, des collectivités
              et du grand public.
            </p>
          </div>
          <div className="mt-4">
            <a
              href="https://gitlab.com/votre-projet/junondashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-bg-hover border border-white/10 rounded-lg text-xs text-accent-cyan hover:bg-white/5 transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Code source sur GitLab
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </SectionCard>

        {/* Sources de données */}
        <SectionCard icon={Database} title="Sources de données">
          <div className="space-y-3">
            {DATA_SOURCES.map((source) => (
              <div key={source.name} className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{source.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{source.description}</p>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 hover:bg-bg-hover rounded-lg transition-colors"
                  title={`Visiter ${source.name}`}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-accent-cyan" />
                </a>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Méthodologie */}
        <SectionCard icon={FlaskConical} title="Méthodologie">
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-accent-cyan">Indices de sécheresse</h3>
              {METHODOLOGY.map((m) => (
                <div key={m.name} className="py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-text-primary font-mono">{m.name}</span>
                    <span className="text-xs text-text-secondary italic">{m.full}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{m.description}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-accent-cyan">Classification (7 classes)</h3>
              <p className="text-xs text-text-secondary">
                Grille standardisée Météo-France / BRGM (RP-64147-FR), basée sur les seuils en écart-type de l'indice :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CLASSIFICATION_CLASSES.map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/5"
                    style={{ backgroundColor: `${c.color}15` }}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-text-primary font-medium">{c.label}</span>
                    <span className="text-xs text-text-secondary ml-auto font-mono">{c.threshold}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Footer */}
        <div className="text-center text-xs text-text-secondary py-4 space-y-1">
          <p>Données mises à jour quotidiennement — les indices sont recalculés à chaque démarrage du serveur.</p>
          <p>Projet open source — contributions bienvenues.</p>
        </div>
      </div>
    </div>
  )
}
