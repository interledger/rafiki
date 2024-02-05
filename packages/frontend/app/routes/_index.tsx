import { version } from '../../../../package.json'
import { redirect } from '@remix-run/node'

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
            relationships, assets, and wallet addresses, among other settings.
          </p>
          <p>
            <a href='https://rafiki.dev' className='font-semibold'>
              https://rafiki.dev
            </a>
          </p>
          <form method="post" action="/">
            <input type="hidden" name="username" value="Username" />
            <button type="submit">Log In</button>
          </form>
        </div>
      </div>
    </div>
  )
}

export async function action() {
  console.log('REDIRECTING TO >>>> ', `http://hydra:4444/oauth2/auth?response_type=code&client_id=${process.env.HYDRA_CLIENT_ID}&redirect_uri=${process.env.HYDRA_CLIENT_REDIRECT_URI}&scope=full_access&state=ab4R32wFF`)
  return redirect(`http://hydra:4444/oauth2/auth?response_type=code&client_id=${process.env.HYDRA_CLIENT_ID}&redirect_uri=${process.env.HYDRA_CLIENT_REDIRECT_URI}&scope=full_access&state=ab4R32wFF`)
}
