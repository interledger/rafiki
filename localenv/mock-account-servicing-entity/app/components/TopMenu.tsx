import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'
import { Bars, XIcon } from './icons'
import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'

const navigation = [
  {
    name: 'Accounts',
    href: '/'
  },
  {
    name: 'Rates',
    href: '/rates'
  }
]

export const TopMenu = () => {
  const [menuIsOpen, setMenuIsOpen] = useState(false)

  return (
    <>
      <div className='fixed top-0 left-0 right-0 z-10 bg-[#3533A0] shadow-md'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16'>
            <div className='flex items-center'>
              <div className='flex items-center flex-shrink-0 space-x-2'>
                <NavLink to='/'>
                  <img className='h-8 w-auto' src='/logo.svg' alt='Logo' />
                </NavLink>
                <p className='text-white px-3 py-2 text-lg font-medium'>Happy Life Bank</p>
              </div>
              <div className='hidden md:block'>
                <div className='ml-10 flex items-baseline space-x-4'>
                  {navigation.map(({ name, href }) => (
                    <NavLink
                      key={name}
                      to={href}
                      className={({ isActive }) =>
                        cx(
                          isActive
                            ? 'text-white border-b-2 border-white'
                            : 'text-white hover:border-b-2 hover:border-white',
                          'px-3 py-2 text-lg font-medium'
                        )
                      }
                    >
                      {name}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
            <div className='hidden md:block'>
              {/* Add any other actions or profile dropdown here */}
            </div>
            <div className='ml-auto flex md:hidden'>
              <button aria-label='open menu' onClick={() => setMenuIsOpen(true)}>
                <Bars
                  strokeWidth={2.5}
                  className='h-8 w-8 text-white hover:text-gray-300'
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Transition.Root show={menuIsOpen} as={Fragment}>
        <Dialog
          as='div'
          className='relative z-20 md:hidden'
          onClose={setMenuIsOpen}
        >
          <Transition.Child
            as={Fragment}
            enter='transition-opacity duration-200'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='transition-opacity duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-black/50' />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter='transition duration-200'
            enterFrom='-translate-y-full'
            enterTo='translate-y-0'
            leave='transition duration-200'
            leaveFrom='translate-y-0'
            leaveTo='-translate-y-full'
          >
            <div className='fixed inset-0 z-20 flex'>
              <Dialog.Panel className='relative flex w-full flex-1 flex-col bg-[#FFF] pt-5 pb-4'>
                <div className='flex flex-shrink-0 items-center justify-between px-4'>
                  <img className='w-8' src='/logo.svg' alt='Logo' />
                  <button type='button' onClick={() => setMenuIsOpen(false)}>
                    <XIcon className='h-8 w-8 text-tealish' />
                  </button>
                </div>
                <div className='mt-5 h-0 flex-1 overflow-y-auto'>
                  <nav className='px-2'>
                    <div className='space-y-1'>
                      {navigation.map(({ name, href }) => (
                        <NavLink
                          key={name}
                          to={href}
                          onClick={() => setMenuIsOpen(false)}
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'text-tealish border-b-2 border-tealish'
                                : 'text-tealish hover:border-b-2 hover:border-tealish',
                              'block px-3 py-2 text-lg font-medium'
                            )
                          }
                        >
                          {name}
                        </NavLink>
                      ))}
                    </div>
                  </nav>
                </div>
              </Dialog.Panel>
            </div>
          </Transition.Child>
        </Dialog>
      </Transition.Root>
    </>
  )
}
