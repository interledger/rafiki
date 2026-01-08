import { Dialog, Transition } from '@headlessui/react'
import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'
import type { FC } from 'react'
import { Fragment, useState } from 'react'
import { Box, Button, Flex, Heading, IconButton } from '@radix-ui/themes'
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
              <Dialog.Panel className='relative flex w-full max-w-xs flex-1 flex-col bg-offwhite pt-5 pb-4'>
                <Flex justify='between' align='center' px='4' pb='4'>
                  <img className='w-8' src='/logo.svg' alt='Logo' />
                  <IconButton
                    variant='ghost'
                    onClick={() => setSidebarIsOpen(false)}
                  >
                    <XIcon className='h-5 w-5' />
                  </IconButton>
                </Flex>
                <Box className='mt-5 h-0 flex-1 overflow-y-auto'>
                  <nav className='px-2'>
                    <Flex direction='column' gap='1'>
                      {navigationToShow.map(({ name, href }) => (
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
                      {authEnabled && (
                        <NavLink
                          key='Account Settings'
                          to='/settings'
                          className={({ isActive }) =>
                            cx(
                              isActive
                                ? 'bg-mercury'
                                : 'text-tealish/70 hover:bg-mercury/70',
                              'flex p-2 font-medium rounded-md'
                            )
                          }
                        >
                          Account Settings
                        </NavLink>
                      )}
                      {logoutUrl && (
                        <Button asChild>
                          <a href={logoutUrl}>Logout</a>
                        </Button>
                      )}
                    </Flex>
                  </nav>
                </Box>
              </Dialog.Panel>
            </div>
          </Transition.Child>
        </Dialog>
      </Transition.Root>
      <nav className='fixed inset-x-0 z-10 flex h-20 flex-col md:inset-y-0 md:h-auto md:w-60'>
        <Flex className='flex min-h-0 flex-1 items-center px-4 py-8 md:flex-col md:items-start md:overflow-y-auto'>
          {/* Logo */}
          <Flex align='center' gap='2' className='flex-shrink-0'>
            <img className='w-8' src='/logo.svg' alt='Logo' />
            <Heading size='7' className='hidden md:inline-block'>
              Rafiki Admin
            </Heading>
          </Flex>
          {/* Logo - END */}
          {/* Desktop Navigation */}
          <Box className='hidden w-full mt-5 flex-1 flex-col overflow-y-auto md:block'>
            <Flex direction='column' gap='2'>
              {navigationToShow.map(({ name, href }) => (
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
              {authEnabled && (
                <NavLink
                  key='Account Settings'
                  to='/settings'
                  className={({ isActive }) =>
                    cx(
                      isActive
                        ? 'bg-mercury'
                        : 'text-tealish/70 hover:bg-mercury/70',
                      'flex p-2 font-medium rounded-md'
                    )
                  }
                >
                  Account Settings
                </NavLink>
              )}
              {logoutUrl && (
                <Button asChild>
                  <a href={logoutUrl}>Logout</a>
                </Button>
              )}
            </Flex>
          </Box>
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
