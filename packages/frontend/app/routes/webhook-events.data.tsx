import { Dialog, Transition } from '@headlessui/react'
import { useLocation, useNavigate, useSearchParams } from '@remix-run/react'
import { Fragment, useEffect } from 'react'
import { XIcon } from '~/components/icons'
import { prettify } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  return null
}

export default function WebhookEventData() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const state = location.state as { data: string }
  const dismiss = () =>
    navigate(`/webhook-events${searchParams ? `?${searchParams}` : null}`, {
      preventScrollReset: true
    })

  useEffect(() => {
    if (!state) dismiss()
  }, [])

  return (
    <Transition.Root show={true} as={Fragment}>
      <Dialog as='div' className='relative z-10' onClose={dismiss}>
        <Transition.Child
          as={Fragment}
          enter='ease-out duration-300'
          enterFrom='opacity-0'
          enterTo='opacity-100'
          leave='ease-in duration-200'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <div className='fixed inset-0 bg-tealish/30 bg-opacity-75 transition-opacity' />
        </Transition.Child>

        <div className='fixed inset-0 z-10 overflow-y-auto'>
          <div className='flex min-h-full items-center justify-center p-4 text-center'>
            <Transition.Child
              as={Fragment}
              enter='ease-out duration-300'
              enterFrom='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
              enterTo='opacity-100 translate-y-0 sm:scale-100'
              leave='ease-in duration-200'
              leaveFrom='opacity-100 translate-y-0 sm:scale-100'
              leaveTo='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
            >
              <Dialog.Panel className='flex flex-col relative transform overflow-hidden rounded-lg max-w-full transition-all bg-white px-4 pb-4 pt-5 text-left shadow-xl w-full sm:max-w-2xl max-h-[calc(100vh_-_64px)]'>
                <div className='absolute right-0 top-0 pr-4 pt-4'>
                  <button
                    type='button'
                    className='text-gray-400 hover:text-gray-500 focus:outline-none'
                    onClick={dismiss}
                  >
                    <span className='sr-only'>Close</span>
                    <XIcon className='h-8 w-8' aria-hidden='true' />
                  </button>
                </div>
                <div className='mt-6 overflow-auto flex-1 text-sm break-words whitespace-pre'>
                  <pre
                    dangerouslySetInnerHTML={{
                      __html: prettify(state && state.data ? state.data : {})
                    }}
                  />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
