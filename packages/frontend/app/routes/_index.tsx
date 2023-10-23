import { version } from '../../../../package.json'

export default function Index() {
  return (
    <div className='pt-4 flex flex-col'>
      <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
        <div className='p-10 space-y-16'>
          <h1 className='text-9xl pt-16 text-[#F37F64]'>Welcome!</h1>
          <div className='space-y-8'>
            <p className='text-7xl'>Rafiki Admin</p>
            <p>This is Rafiki&apos;s administrative user interface.</p>
            <p>v{version}</p>
          </div>
          <p>
            In this web application, you&apos;ll be able to manage peering
            relationships, assets, and payment pointers, among other settings.
          </p>
          <p>
            <a href='https://rafiki.dev' className='font-semibold'>
              https://rafiki.dev
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
