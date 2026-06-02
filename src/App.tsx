import { useReader } from './store/readerStore'
import LandingView from './components/LandingView'
import ReaderView from './components/ReaderView'
import CrtOverlay from './components/CrtOverlay'

export default function App() {
  const hasContent = useReader((s) => s.tokens.length > 0)

  return (
    <>
      {hasContent ? <ReaderView /> : <LandingView />}
      <CrtOverlay />
    </>
  )
}
