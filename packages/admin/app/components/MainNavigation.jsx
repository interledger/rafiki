import { NavLink } from '@remix-run/react'

function MainNavigation() {
  return (
    <nav id='main-navigation'>
      <NavLink className='nav-item' to='/peers'>
        Peers
      </NavLink>
      <NavLink className='nav-item' to='/assets'>
        Assets
      </NavLink>
    </nav>
  )
}

export default MainNavigation
