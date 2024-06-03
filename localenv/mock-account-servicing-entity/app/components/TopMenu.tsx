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
    href: '/rates/view'
  }
]

export const TopMenu = ({ name, logo }: { name: string; logo: string }) => {
  const [topmenuIsOpen, setTopMenuIsOpen] = useState(false)

  return (
    <>
      <Transition.Root show={topmenuIsOpen} as={Fragment}>
        <Dialog
          as='div'
          className='relative z-20 lg:hidden'
          onClose={setTopMenuIsOpen}
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
              <Dialog.Panel className='relative flex w-full h-min flex-1 flex-col bg-main_blue text-white pt-5 pb-4'>
                <div className='flex flex-shrink-0 items-center justify-between px-4'>
                  <img className='w-8' src={`/white-${logo}`} alt='Logo' />
                  <button type='button' onClick={() => setTopMenuIsOpen(false)}>
                    <XIcon className='h-8 w-8 text-white' />
                  </button>
                </div>
                <div className='mt-5 h-0 flex-1 overflow-y-auto'>
                  <nav className='px-2'>
                    <div className='space-y-1'>
                      {navigation.map(({ name, href }) => (
                        <NavLink
                          key={name}
                          to={href}
                          onClick={() => setTopMenuIsOpen(false)}
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'bg-secondary_blue'
                                : ' hover:bg-secondary_blue',
                              'flex p-2 font-medium rounded-md text-white'
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
      <nav className='fixed z-10 w-full h-16 top-0 block bg-main_blue text-white'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center h-16'>
            <div className='flex items-center flex-shrink-0 space-x-2'>
              <img className='w-8' src={`/white-${logo}`} alt='Logo' />
              <p className='px-3 py-2 text-lg font-medium'>{name}</p>
            </div>

            {/* Desktop Navigation */}
            <div className='hidden md:block'>
              <div className='ml-10 flex items-baseline space-x-4'>
                {navigation.map(({ name, href }) => (
                  <NavLink
                    key={name}
                    to={href}
                    className={({ isActive }) =>
                      cx(
                        isActive
                          ? 'bg-secondary_blue'
                          : 'hover:bg-secondary_blue',
                        'flex p-2 font-medium rounded-md text-white'
                      )
                    }
                  >
                    {name}
                  </NavLink>
                ))}
              </div>
            </div>
            {/* Desktop Navigation - END */}
            <div className='ml-auto flex md:hidden'>
              <button aria-label='open menu'>
                <Bars
                  strokeWidth={2.5}
                  className='h-10 w-10 hover:text-teal-700 text-white'
                  onClick={() => setTopMenuIsOpen(true)}
                />
              </button>
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}
