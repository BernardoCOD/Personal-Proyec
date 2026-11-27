import { Suspense } from 'react'
import { Nav, NavInferior } from '@/componentes/nav-inferior'

export default function LayoutApp({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto max-w-lg px-4 pt-5 pb-28 md:pt-8 md:pb-10">
      <div className="md:order-first">
        <Suspense fallback={<Nav ruta="" />}>
          <NavInferior />
        </Suspense>
      </div>
      {children}
    </div>
  )
}
