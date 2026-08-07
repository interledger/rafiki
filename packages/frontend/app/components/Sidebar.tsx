import { Dialog, Transition } from '@headlessui/react'
import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'
import type { FC } from 'react'
import { Fragment, useState } from 'react'
import { Box, Button, Flex, IconButton, Text } from '@radix-ui/themes'
import { Bars, XIcon } from './icons'

interface SidebarProps {
  logoutUrl: string
  authEnabled: boolean
  hasApiCredentials: boolean
}

const navigation = [
  {
    name: 'Home',
    href: '/'
  },
  {
    name: 'Tenants',
    href: '/tenants'
  },
  {
    name: 'Assets',
    href: '/assets'
  },
  {
    name: 'Peers',
    href: '/peers'
  },
  {
    name: 'Wallet Addresses',
    href: '/wallet-addresses'
  },
  {
    name: 'Webhook Events',
    href: '/webhook-events'
  },
  {
    name: 'Payments',
    href: '/payments'
  }
]

export const Sidebar: FC<SidebarProps> = ({
  logoutUrl,
  authEnabled,
  hasApiCredentials
}) => {
  const [sidebarIsOpen, setSidebarIsOpen] = useState(false)

  const navigationToShow = hasApiCredentials
    ? navigation
    : navigation.filter(({ name }) => name === 'Home')

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
              <Dialog.Panel className='relative flex w-full max-w-xs flex-1 flex-col border-r border-mercury bg-[#fffef8] pt-5 pb-6'>
                <div className='flex justify-between items-center px-5 mb-4'>
                  <img className='w-8' src='/logo.svg' alt='' />
                  <IconButton
                    variant='ghost'
                    onClick={() => setSidebarIsOpen(false)}
                    aria-label='close menu'
                  >
                    <XIcon className='h-5 w-5' />
                  </IconButton>
                </div>
                <nav
                  className='mt-5 h-0 flex-1 overflow-y-auto'
                  aria-label='main navigation'
                >
                  <ul className='flex flex-col gap-1 px-3'>
                    {navigationToShow.map(({ name, href }) => (
                      <li key={name}>
                        <NavLink
                          to={href}
                          onClick={() => setSidebarIsOpen(false)}
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'bg-[#F37F64]/10 text-[#F37F64]'
                                : 'text-tealish/70 hover:bg-[#F37F64]/5',
                              'flex px-3 py-2 font-medium rounded-md'
                            )
                          }
                        >
                          {name}
                        </NavLink>
                      </li>
                    ))}

                    {authEnabled && (
                      <li>
                        <NavLink
                          key='Account Settings'
                          to='/settings'
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'bg-[#F37F64]/10 text-[#F37F64]'
                                : 'text-tealish/70 hover:bg-[#F37F64]/5',
                              'flex px-3 py-2 font-medium rounded-md'
                            )
                          }
                        >
                          Account Settings
                        </NavLink>
                      </li>
                    )}
                  </ul>
                  {logoutUrl && (
                    <Button asChild>
                      <a href={logoutUrl}>Logout</a>
                    </Button>
                  )}
                </nav>
              </Dialog.Panel>
            </div>
          </Transition.Child>
        </Dialog>
      </Transition.Root>
      <nav
        className='fixed inset-x-0 z-10 flex h-20 flex-col border-r border-mercury bg-[#fffef8] md:inset-y-0 md:h-auto md:w-60'
        aria-label='main navigation'
      >
        <Flex className='flex min-h-0 flex-1 items-center px-5 py-6 md:flex-col md:items-start md:overflow-y-auto'>
          {/* Logo */}
          <Flex align='center' gap='2' className='flex-shrink-0'>
            <img className='w-8' src='/logo.svg' alt='' />
            <Text
              size='6'
              weight='bold'
              className='hidden md:inline-block whitespace-nowrap'
            >
              Rafiki Admin
            </Text>
          </Flex>
          {/* Logo - END */}
          {/* Desktop Navigation */}
          <nav className='hidden w-full mt-5 flex-1 flex-col overflow-y-auto md:block'>
            <ul className='flex flex-col gap-1'>
              {navigationToShow.map(({ name, href }) => (
                <li key={name}>
                  <NavLink
                    key={name}
                    to={href}
                    className={({ isActive }) =>
                      cx(
                        isActive
                          ? 'bg-[#F37F64]/10 text-[#F37F64]'
                          : 'text-tealish/70 hover:bg-[#F37F64]/5',
                        'flex px-3 py-2 font-medium rounded-md'
                      )
                    }
                  >
                    {name}
                  </NavLink>
                </li>
              ))}

              {authEnabled && (
                <li>
                  <NavLink
                    key='Account Settings'
                    to='/settings'
                    className={({ isActive }) =>
                      cx(
                        isActive
                          ? 'bg-[#F37F64]/10 text-[#F37F64]'
                          : 'text-tealish/70 hover:bg-[#F37F64]/5',
                        'flex px-3 py-2 font-medium rounded-md'
                      )
                    }
                  >
                    Account Settings
                  </NavLink>
                </li>
              )}
            </ul>

            {logoutUrl && (
              <Button className='mt-1' asChild>
                <a href={logoutUrl}>Logout</a>
              </Button>
            )}
          </nav>

          {/* Desktop Navigation - END */}
          <Box className='ml-auto flex md:hidden'>
            <IconButton
              variant='ghost'
              aria-label='open menu'
              onClick={() => setSidebarIsOpen(true)}
            >
              <Bars strokeWidth={2.5} className='h-6 w-6' />
            </IconButton>
          </Box>
        </Flex>
      </nav>
    </>
  )
}
