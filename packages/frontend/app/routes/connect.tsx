// This is a dummy page
// TODO: Integrate with Ory Kratos
import { redirect } from '@remix-run/node'

export default function Connect() {
    return (
        <div className='pt-4 flex flex-col'>
            <div className='flex flex-col rounded-md bg-offwhite px-6 text-center min-h-[calc(100vh-3rem)]'>
                <div className='p-10 space-y-16'>
                    <h3 className='text-2xl pt-16'>Login to Rafiki Admin</h3>
                    <div className='space-y-8'>
                        <form method="post" action="/connect">
                            <input type="text" name="username" placeholder="Username" required />
                            <input type="password" name="password" placeholder="Password" required />
                            <button type="submit">Log In</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}

export async function action() {
    console.log('REDIRECTING TO >>>> ', `http://hydra:4444/oauth2/auth?response_type=code&client_id=${process.env.HYDRA_CLIENT_ID}&redirect_uri=${process.env.HYDRA_CLIENT_REDIRECT_URI}&scope=full_access&state=ab4R32wFF`)
    return redirect(`http://localhost:4444/oauth2/auth?response_type=code&client_id=${process.env.HYDRA_CLIENT_ID}&redirect_uri=${process.env.HYDRA_CLIENT_REDIRECT_URI}&scope=full_access&state=ab4R32wFF`)
}
