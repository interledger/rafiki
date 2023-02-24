import { Dialog, Transition } from '@headlessui/react'
import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'
import { Fragment, useState } from 'react'
import { Bars } from './icons/Bars'
import { X } from './icons/X'

const navigation = [
  {
    name: 'Home',
    href: '/'
  },
  {
    name: 'Peers',
    href: '/peers'
  },
  {
    name: 'Assets',
    href: '/assets'
  }
]

export const Sidebar = () => {
  const [sidebarIsOpen, setSidebarIsOpen] = useState(false)

  return (
    <>
      <Transition.Root show={sidebarIsOpen} as={Fragment}>
        <Dialog
          as='div'
          className='relative z-20 lg:hidden'
          onClose={setSidebarIsOpen}
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
            enterFrom='-translate-x-full'
            enterTo='translate-x-0'
            leave='transition duration-200'
            leaveFrom='translate-x-0'
            leaveTo='-translate-x-full'
          >
            <div className='fixed inset-0 z-20 flex'>
              <Dialog.Panel className='relative flex w-full max-w-xs flex-1 flex-col bg-offwhite pt-5 pb-4'>
                <div className='flex flex-shrink-0 items-center justify-between px-4'>
                  <img className='w-8' src='/logo.svg' alt='Logo' />
                  <button type='button' onClick={() => setSidebarIsOpen(false)}>
                    <X className='h-8 w-8 text-tealish' />
                  </button>
                </div>
                <div className='mt-5 h-0 flex-1 overflow-y-auto'>
                  <nav className='px-2'>
                    <div className='space-y-1'>
                      {navigation.map(({ name, href }) => (
                        <NavLink
                          key={name}
                          to={href}
                          onClick={() => setSidebarIsOpen(false)}
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'bg-mercury'
                                : 'text-tealish/70 hover:bg-mercury/70',
                              'flex p-2 font-medium rounded-md'
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
      <nav className='fixed inset-x-0 z-10 flex h-20 flex-col bg-offwhite shadow-md md:inset-y-0 md:h-auto md:w-60 md:shadow-none'>
        <div className='flex min-h-0 flex-1 items-center px-4 py-8 md:flex-col md:items-start md:overflow-y-auto md:bg-gradient-primary'>
          {/* Logo */}
          <div className='flex items-center flex-shrink-0 space-x-2'>
            <img className='w-8' src='/logo.svg' alt='Logo' />
            <span className='hidden font-medium md:inline-block text-3xl'>
              Rafiki Admin
            </span>
          </div>
          {/* Logo - END */}
          {/* Desktop Navigation */}
          <div className='hidden w-full mt-5 flex-1 flex-col overflow-y-auto md:block'>
            <div className='space-y-2'>
              {navigation.map(({ name, href }) => (
                <NavLink
                  key={name}
                  to={href}
                  className={({ isActive }) =>
                    cx(
                      isActive
                        ? 'bg-mercury'
                        : 'text-tealish/70 hover:bg-mercury/70',
                      'flex p-2 font-medium rounded-md'
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
                className='h-10 w-10 hover:text-teal-700 text-tealish'
                onClick={() => setSidebarIsOpen(true)}
              />
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
