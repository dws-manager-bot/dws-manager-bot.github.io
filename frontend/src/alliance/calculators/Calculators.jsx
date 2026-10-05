import { useI18n } from '../../i18n/I18n.jsx'

export default function Calculators() {
  const { t } = useI18n()
  return <div className="muted">{t('shell.loading')}</div>
}
