import { useEffect, useState } from 'react'
import type { DiskInfo, ReportFileList, ReportSuggestion, ScanState, SpaceReport, SuggestionSafety } from '../../shared/types'
import { CheckedActionBar } from '../components/CheckedActionBar'
import { CategoryTile } from '../components/Icon'
import { ItemList } from '../components/ItemList'
import { Ring } from '../components/Ring'
import { formatBytes, plural } from '../lib/format'
import { useChecked } from '../lib/useChecked'

interface Props {
  state: ScanState
  revision: number
}

const LARGE_THRESHOLD = 1_000_000_000

const STALE_OPTIONS = [
  { label: '1 year', value: 365 },
  { label: '2 years', value: 730 },
  { label: '3 years', value: 1095 },
]

const RECENT_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
]

const SAFETY_LABELS: Record<SuggestionSafety, string> = {
  safe: 'Safe',
  review: 'Review first',
  'your-call': 'Your call',
}

export function ReportTab({ state, revision }: Props) {
  const { checked, toggle, checkAll, drop, clear } = useChecked()
  const [staleDays, setStaleDays] = useState(365)
  const [recentDays, setRecentDays] = useState(7)
  const [report, setReport] = useState<SpaceReport | null>(null)
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const scanKey = `${state.root}:${state.scannedAt}`

  useEffect(() => {
    let live = true
    void window.sa.report.get({ largeThreshold: LARGE_THRESHOLD, staleDays, recentDays }).then((r) => live && setReport(r))
    return () => {
      live = false
    }
  }, [staleDays, recentDays, revision])

  useEffect(() => {
    void window.sa.system.disk().then(setDisk)
  }, [revision])

  useEffect(() => clear(), [scanKey, clear])

  const toggleSection = (id: string) => setExpanded((current) => (current === id ? null : id))

  if (!report) return <div className="report"><p className="muted">Building your report…</p></div>

  return (
    <div className="report">
      <section className="report-hero" aria-label="Summary">
        <Ring
          fraction={disk && disk.used > 0 ? report.reclaimable / disk.used : 0}
          label="Share of used space that could be freed"
          size={120}
          stroke={11}
        >
          <span className="ring-figure small">{disk && disk.used > 0 ? Math.round((report.reclaimable / disk.used) * 100) : 0}%</span>
          <span className="ring-caption">of used</span>
        </Ring>
        <div className="report-hero-copy">
          <div className="stat-label">You could free up about</div>
          <div className="report-reclaimable">{formatBytes(report.reclaimable)}</div>
          <p className="muted">
            {report.suggestions.length === 0
              ? 'Nothing obvious to clean up in this scan.'
              : `Across ${plural(report.suggestions.length, 'suggestion')} below. Items that appear in more than one are counted once.`}
          </p>
        </div>
        {disk && (
          <div className="report-disk">
            <div className="stat-label">Disk</div>
            <div>
              <strong>{formatBytes(disk.used)}</strong> used of {formatBytes(disk.total)}
            </div>
            <div className="muted">{formatBytes(disk.free)} available</div>
          </div>
        )}
      </section>

      <CheckedActionBar checked={checked} onRemoved={drop} onClear={clear} />

      <h2 className="report-heading">Suggestions</h2>
      <div className="cards">
        {report.suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            open={expanded === s.id}
            onToggleOpen={() => toggleSection(s.id)}
            checked={checked}
            onToggle={toggle}
            onCheckAll={checkAll}
          />
        ))}
        <section className="card">
          <div className="card-header static">
            <div className="card-lead">
              <CategoryTile id="duplicates" />
              <div>
                <h3>Duplicate files</h3>
                <p className="muted">Identical copies waste space. Run Find Duplicates on the Cleanup tab to check.</p>
              </div>
            </div>
            <span className="safety review">{SAFETY_LABELS.review}</span>
          </div>
        </section>
      </div>

      <FileSection
        title="Stale files"
        description={`Files of 10 MB or more in ${report.scope} that haven’t been modified for`}
        options={STALE_OPTIONS}
        value={staleDays}
        onChange={setStaleDays}
        selectLabel="Stale file age"
        list={report.stale}
        emptyText="No stale files found."
        checked={checked}
        onToggle={toggle}
        onCheckAll={checkAll}
      />

      <FileSection
        title="Recently added"
        description={`Files of 1 MB or more in ${report.scope} modified in the last`}
        options={RECENT_OPTIONS}
        value={recentDays}
        onChange={setRecentDays}
        selectLabel="Recent file window"
        list={report.recent}
        emptyText="No large recent files."
        checked={checked}
        onToggle={toggle}
        onCheckAll={checkAll}
      />
    </div>
  )
}

interface SuggestionCardProps {
  suggestion: ReportSuggestion
  open: boolean
  onToggleOpen(): void
  checked: Map<number, ReportSuggestion['items'][number]>
  onToggle(row: ReportSuggestion['items'][number]): void
  onCheckAll(rows: ReportSuggestion['items']): void
}

function SuggestionCard({ suggestion: s, open, onToggleOpen, checked, onToggle, onCheckAll }: SuggestionCardProps) {
  return (
    <section className="card">
      <button type="button" className="card-header" aria-expanded={open} onClick={onToggleOpen}>
        <div className="card-lead">
          <CategoryTile id={s.id} />
          <div>
            <h3>
              {s.title} <span className={`safety ${s.safety}`}>{SAFETY_LABELS[s.safety]}</span>
            </h3>
            <p className="muted">{s.advice}</p>
          </div>
        </div>
        <div className="card-total">
          <strong>{formatBytes(s.total)}</strong>
          <span className="muted">{plural(s.count, 'item')}</span>
        </div>
      </button>
      {open && (
        <div className="card-body">
          {s.id === 'trash' ? (
            <ItemList rows={s.items} checked={checked} onToggle={null} onOpenLabel="Open Trash" />
          ) : (
            <>
              <div className="card-tools">
                <button type="button" className="button ghost" onClick={() => onCheckAll(s.items)}>
                  Check all shown
                </button>
                {s.count > s.items.length && <span className="muted">Showing the largest {s.items.length} of {s.count}</span>}
              </div>
              <ItemList rows={s.items} checked={checked} onToggle={onToggle} />
            </>
          )}
        </div>
      )}
    </section>
  )
}

interface FileSectionProps {
  title: string
  description: string
  options: { label: string; value: number }[]
  value: number
  onChange(value: number): void
  selectLabel: string
  list: ReportFileList
  emptyText: string
  checked: Map<number, ReportFileList['items'][number]>
  onToggle(row: ReportFileList['items'][number]): void
  onCheckAll(rows: ReportFileList['items']): void
}

function FileSection({ title, description, options, value, onChange, selectLabel, list, emptyText, checked, onToggle, onCheckAll }: FileSectionProps) {
  return (
    <section className="report-section" aria-label={title}>
      <div className="report-section-header">
        <div>
          <h2 className="report-heading">{title}</h2>
          <p className="muted">
            {description}{' '}
            <select aria-label={selectLabel} value={value} onChange={(e) => onChange(Number(e.target.value))}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </p>
        </div>
        <div className="card-total">
          <strong>{formatBytes(list.total)}</strong>
          <span className="muted">{plural(list.count, 'file')}</span>
        </div>
      </div>
      {list.items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <>
          <div className="card-tools">
            <button type="button" className="button ghost" onClick={() => onCheckAll(list.items)}>
              Check all shown
            </button>
            {list.count > list.items.length && <span className="muted">Showing the largest {list.items.length} of {list.count}</span>}
          </div>
          <ItemList rows={list.items} checked={checked} onToggle={onToggle} />
        </>
      )}
    </section>
  )
}
