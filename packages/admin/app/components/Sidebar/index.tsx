import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'

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

// TODO: Mobile menu
export const Sidebar = () => {
  return (
    <div className='hidden md:fixed md:flex md:w-60 md:inset-y-0 md:flex-col'>
      <div className='flex pt-8 flex-grow flex-col overflow-y-auto bg-offwhite'>
        {/* Logo */}
        <div className='flex px-4 items-center flex-shrink-0 space-x-2'>
          <img className='w-8' src='/logo.svg' alt='Logo' />
          <span className='font-medium text-3xl'>Rafiki Admin</span>
        </div>
        {/* Logo - END */}
        {/* Desktop Navigation */}
        <nav className='flex mt-5 flex-1 flex-col overflow-y-auto'>
          <div className='space-y-2 px-4'>
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
        </nav>
        {/* Desktop Navigation - END */}
      </div>
    </div>
  )
}
