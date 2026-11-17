-- Oyun içi ekran: nişangâh, isabet işareti, cephane, can, skor ve süre,
-- bölgeler, radar, öldürme akışı, puan bildirimleri, hasar yönü, dürbün.
--
-- Hud yalnızca çizer; neyi göstereceğini Main her karede update() ile verir.

local Ui = require(script.Parent.Ui)

local Hud = {}

local C = Ui.Colors
local make, label, frame = Ui.make, Ui.label, Ui.frame

local gui
local canvas
local scale
local refs = {}

local killRows = {}
local popups = {}
local indicators = {}
local radarDots = {}
local hitUntil = 0
local hitKill = false
local announceUntil = 0
local bannerUntil = 0

function Hud.scale()
	return scale and scale.Scale or 1
end

local function edge(name, size, position, anchor, rotation)
	return frame({
		Name = name,
		Size = size,
		Position = position,
		AnchorPoint = anchor,
		BackgroundColor3 = C.bad,
		BackgroundTransparency = 0,
	}, {
		make("UIGradient", {
			Rotation = rotation,
			Transparency = NumberSequence.new({
				NumberSequenceKeypoint.new(0, 0),
				NumberSequenceKeypoint.new(1, 1),
			}),
		}),
	})
end

local function buildCrosshair()
	local holder = frame({
		Name = "Crosshair",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(0, 0),
		Parent = canvas,
	})
	local lines = {}
	for index, spec in ipairs({ { 0, -1 }, { 0, 1 }, { -1, 0 }, { 1, 0 } }) do
		local vertical = spec[1] == 0
		lines[index] = frame({
			Name = "Line",
			AnchorPoint = Vector2.new(0.5, 0.5),
			Size = vertical and UDim2.fromOffset(2, 9) or UDim2.fromOffset(9, 2),
			BackgroundColor3 = C.white,
			Parent = holder,
		}, { Ui.stroke(C.black, 1, 0.5) })
		lines[index]:SetAttribute("DX", spec[1])
		lines[index]:SetAttribute("DY", spec[2])
	end
	local dot = frame({
		Name = "Dot",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Size = UDim2.fromOffset(3, 3),
		BackgroundColor3 = C.white,
		Parent = holder,
	}, { Ui.stroke(C.black, 1, 0.5) })
	refs.crosshair = holder
	refs.crossLines = lines
	refs.crossDot = dot

	local hit = frame({
		Name = "Hitmarker",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(36, 36),
		Visible = false,
		Parent = canvas,
	})
	refs.hitLines = {}
	for index, spec in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		refs.hitLines[index] = frame({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, spec[1] * 9, 0.5, spec[2] * 9),
			Size = UDim2.fromOffset(2, 10),
			Rotation = spec[1] * spec[2] * -45,
			BackgroundColor3 = C.white,
			Parent = hit,
		}, { Ui.stroke(C.black, 1, 0.4) })
	end
	refs.hit = hit
end

local function buildScope()
	local scope = frame({
		Name = "Scope",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = false,
		ZIndex = 0,
		Parent = canvas,
	})
	frame({
		Name = "Glass",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.94, 0.94),
		SizeConstraint = Enum.SizeConstraint.RelativeYY,
		BackgroundTransparency = 1,
		Parent = scope,
	}, {
		Ui.round(),
		make("UIStroke", { Color = C.black, Thickness = 1600, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }),
		frame({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.new(1, 0, 0, 1),
			BackgroundColor3 = C.black,
		}),
		frame({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.new(0, 1, 1, 0),
			BackgroundColor3 = C.black,
		}),
		frame({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromOffset(4, 4),
			BackgroundColor3 = C.bad,
		}, { Ui.round() }),
	})
	refs.scope = scope
end

local function buildVitals()
	local health = frame({
		Name = "HealthPanel",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 24, 1, -24),
		Size = UDim2.fromOffset(270, 46),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
	refs.healthPanel = health
	refs.healthText = label({
		Size = UDim2.fromOffset(80, 28),
		Text = "100",
		TextSize = 28,
		Font = Ui.FontBlack,
		Parent = health,
	}, { Ui.textStroke() })
	label({
		Position = UDim2.fromOffset(62, 6),
		Size = UDim2.fromOffset(60, 20),
		Text = "CAN",
		TextSize = 13,
		TextColor3 = C.dim,
		Parent = health,
	}, { Ui.textStroke() })
	local bar = frame({
		Position = UDim2.fromOffset(0, 32),
		Size = UDim2.fromOffset(270, 9),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.3,
		Parent = health,
	}, { Ui.corner(3) })
	refs.healthFill = frame({
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = C.text,
		Parent = bar,
	}, { Ui.corner(3) })

	local ammo = frame({
		Name = "AmmoPanel",
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -24, 1, -20),
		Size = UDim2.fromOffset(300, 100),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
	refs.ammoPanel = ammo
	refs.weaponName = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(300, 20),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = C.accent,
		TextSize = 16,
		Text = "",
		Parent = ammo,
	}, { Ui.textStroke() })
	refs.ammoMag = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -78, 0, 20),
		Size = UDim2.fromOffset(140, 46),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextSize = 44,
		Font = Ui.FontBlack,
		Text = "30",
		Parent = ammo,
	}, { Ui.textStroke() })
	refs.ammoReserve = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 38),
		Size = UDim2.fromOffset(72, 24),
		TextSize = 20,
		TextColor3 = C.dim,
		Text = "/ 120",
		Parent = ammo,
	}, { Ui.textStroke() })
	refs.ammoInfo = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 70),
		Size = UDim2.fromOffset(300, 18),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextSize = 13,
		TextColor3 = C.dim,
		Text = "",
		Parent = ammo,
	}, { Ui.textStroke() })
	local reload = frame({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.5, 44),
		Size = UDim2.fromOffset(120, 5),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.35,
		Visible = false,
		Parent = canvas,
	}, { Ui.corner(2) })
	refs.reloadFill = frame(
		{ Size = UDim2.fromScale(0, 1), BackgroundColor3 = C.accent, Parent = reload },
		{ Ui.corner(2) }
	)
	refs.reloadBar = reload
	refs.prompt = label({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.5, 56),
		Size = UDim2.fromOffset(300, 20),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 15,
		TextColor3 = C.accent,
		Text = "",
		Parent = canvas,
	}, { Ui.textStroke() })

	-- Can azalınca ekran kenarları kızarır
	local vignette =
		frame({ Name = "Vignette", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Parent = canvas })
	edge("Top", UDim2.fromScale(1, 0.22), UDim2.fromScale(0, 0), Vector2.zero, 90).Parent = vignette
	edge("Bottom", UDim2.fromScale(1, 0.22), UDim2.fromScale(0, 1), Vector2.new(0, 1), -90).Parent = vignette
	edge("Left", UDim2.fromScale(0.16, 1), UDim2.fromScale(0, 0), Vector2.zero, 0).Parent = vignette
	edge("Right", UDim2.fromScale(0.16, 1), UDim2.fromScale(1, 0), Vector2.new(1, 0), 180).Parent = vignette
	refs.vignette = vignette
end

local function buildTop()
	local top = frame({
		Name = "Top",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 10),
		Size = UDim2.fromOffset(380, 76),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
	local function teamBox(name, x, anchor)
		local box = frame({
			Name = name,
			AnchorPoint = anchor,
			Position = UDim2.fromScale(x, 0),
			Size = UDim2.fromOffset(112, 46),
			BackgroundColor3 = C.ink,
			BackgroundTransparency = 0.3,
			Parent = top,
		}, { Ui.corner(6) })
		local stripe = frame({ Size = UDim2.new(1, 0, 0, 3), BackgroundColor3 = C.text, Parent = box })
		local score = label({
			Position = UDim2.fromOffset(0, 4),
			Size = UDim2.new(1, 0, 0, 28),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextSize = 28,
			Font = Ui.FontBlack,
			Text = "0",
			Parent = box,
		})
		local name2 = label({
			Position = UDim2.fromOffset(0, 30),
			Size = UDim2.new(1, 0, 0, 14),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextSize = 11,
			TextColor3 = C.dim,
			Text = "",
			Parent = box,
		})
		return { box = box, stripe = stripe, score = score, name = name2 }
	end
	refs.left = teamBox("Left", 0, Vector2.zero)
	refs.right = teamBox("Right", 1, Vector2.new(1, 0))
	local center = frame({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0),
		Size = UDim2.fromOffset(140, 46),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.15,
		Parent = top,
	}, { Ui.corner(6) })
	refs.timer = label({
		Position = UDim2.fromOffset(0, 3),
		Size = UDim2.new(1, 0, 0, 26),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 24,
		Font = Ui.FontBlack,
		Text = "0:00",
		Parent = center,
	})
	refs.modeLine = label({
		Position = UDim2.fromOffset(0, 29),
		Size = UDim2.new(1, 0, 0, 14),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 11,
		TextColor3 = C.accent,
		Text = "",
		Parent = center,
	})
	refs.subLine = label({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 50),
		Size = UDim2.fromOffset(380, 18),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 14,
		Text = "",
		Parent = top,
	}, { Ui.textStroke() })

	local points = frame({
		Name = "Points",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 62),
		Size = UDim2.fromOffset(170, 40),
		BackgroundTransparency = 1,
		Visible = false,
		Parent = canvas,
	}, { Ui.list(Enum.FillDirection.Horizontal, 10, Enum.HorizontalAlignment.Center) })
	refs.points = points
	refs.pointBoxes = {}
	for index, letter in ipairs({ "A", "B", "C" }) do
		local box = frame({
			Name = letter,
			LayoutOrder = index,
			Size = UDim2.fromOffset(38, 38),
			BackgroundColor3 = C.ink,
			BackgroundTransparency = 0.25,
			Parent = points,
		}, { Ui.corner(19) })
		local stroke = Ui.stroke(C.text, 2, 0)
		stroke.Parent = box
		local text = label({
			Size = UDim2.fromScale(1, 1),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextSize = 18,
			Font = Ui.FontBlack,
			Text = letter,
			Parent = box,
		})
		local progress = frame({
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.new(0, 6, 1, 4),
			Size = UDim2.fromOffset(0, 4),
			BackgroundColor3 = C.text,
			Parent = box,
		}, { Ui.corner(2) })
		refs.pointBoxes[letter] = { box = box, stroke = stroke, text = text, progress = progress }
	end
end

local function buildRadar()
	local radar = frame({
		Name = "Radar",
		Position = UDim2.fromOffset(20, 20),
		Size = UDim2.fromOffset(150, 150),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.35,
		ClipsDescendants = true,
		Parent = canvas,
	}, { Ui.round(), Ui.stroke(C.line, 2, 0.2) })
	frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, 0, 0, 1),
		BackgroundColor3 = C.line,
		BackgroundTransparency = 0.5,
		Parent = radar,
	})
	frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 1, 1, 0),
		BackgroundColor3 = C.line,
		BackgroundTransparency = 0.5,
		Parent = radar,
	})
	label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(12, 12),
		TextXAlignment = Enum.TextXAlignment.Center,
		Text = "▲",
		TextSize = 12,
		TextColor3 = C.accent,
		Parent = radar,
	})
	refs.radar = radar
end

local function buildFeeds()
	refs.killfeed = frame({
		Name = "KillFeed",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -20, 0, 20),
		Size = UDim2.fromOffset(340, 160),
		BackgroundTransparency = 1,
		Parent = canvas,
	}, { Ui.list(Enum.FillDirection.Vertical, 4, Enum.HorizontalAlignment.Right) })

	refs.popups = frame({
		Name = "Popups",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.5, 84),
		Size = UDim2.fromOffset(320, 120),
		BackgroundTransparency = 1,
		Parent = canvas,
	}, { Ui.list(Enum.FillDirection.Vertical, 2, Enum.HorizontalAlignment.Center) })

	refs.announce = label({
		Name = "Announce",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 112),
		Size = UDim2.fromOffset(640, 24),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 18,
		Text = "",
		Visible = false,
		Parent = canvas,
	}, { Ui.textStroke(0.2) })

	local banner = frame({
		Name = "Banner",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.3),
		Size = UDim2.fromOffset(560, 84),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.2,
		Visible = false,
		Parent = canvas,
	}, { Ui.corner(8), Ui.stroke(C.accent, 2, 0.3) })
	refs.bannerTitle = label({
		Position = UDim2.fromOffset(0, 10),
		Size = UDim2.new(1, 0, 0, 34),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 30,
		Font = Ui.FontBlack,
		TextColor3 = C.accent,
		Parent = banner,
	})
	refs.bannerText = label({
		Position = UDim2.fromOffset(16, 46),
		Size = UDim2.new(1, -32, 0, 30),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 15,
		TextWrapped = true,
		Parent = banner,
	})
	refs.banner = banner

	refs.indicators = frame({
		Name = "DamageIndicators",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(240, 240),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
end

function Hud.build(playerGui, camera)
	gui = make("ScreenGui", {
		Name = "Hud",
		IgnoreGuiInset = true,
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 1,
		Enabled = false,
		Parent = playerGui,
	})
	canvas, scale = Ui.canvas(gui, camera)
	buildScope()
	buildCrosshair()
	buildVitals()
	buildTop()
	buildRadar()
	buildFeeds()
	return gui
end

-- Roblox'un üst çubuğu (menü ve sohbet düğmeleri) sol ve sağ üst köşededir;
-- radar ve öldürme akışı onun altına iner. px ekran pikselidir.
function Hud.setTopInset(px)
	local offset = 20 + math.max(0, px) / Hud.scale()
	refs.radar.Position = UDim2.fromOffset(20, offset)
	refs.killfeed.Position = UDim2.new(1, -20, 0, offset)
end

-- Dokunmatik ekranda sol alt köşe çubuğa, sağ alt köşe düğmelere ayrılır;
-- can ve cephane yukarı taşınır.
function Hud.setTouchLayout(touch)
	if touch then
		refs.healthPanel.AnchorPoint = Vector2.new(0, 0)
		refs.healthPanel.Position = UDim2.fromOffset(186, refs.radar.Position.Y.Offset + 4)
		refs.ammoPanel.AnchorPoint = Vector2.new(1, 0)
		refs.ammoPanel.Position = UDim2.new(1, -24, 0, refs.radar.Position.Y.Offset + 136)
	else
		refs.healthPanel.AnchorPoint = Vector2.new(0, 1)
		refs.healthPanel.Position = UDim2.new(0, 24, 1, -24)
		refs.ammoPanel.AnchorPoint = Vector2.new(1, 1)
		refs.ammoPanel.Position = UDim2.new(1, -24, 1, -20)
	end
end

function Hud.gui()
	return gui
end

function Hud.canvas()
	return canvas
end

function Hud.setVisible(visible)
	gui.Enabled = visible
end

-- Isabet işareti (sunucudan doğrulanmış)
function Hud.hitmarker(info)
	hitUntil = os.clock() + (info.killed and 0.32 or 0.16)
	hitKill = info.killed == true
	local color = info.killed and C.bad or (info.headshot and C.accent or C.white)
	for _, line in ipairs(refs.hitLines) do
		line.BackgroundColor3 = color
		line.Size = UDim2.fromOffset(2, info.headshot and 13 or 10)
	end
end

function Hud.damageFrom(position)
	if typeof(position) ~= "Vector3" then
		return
	end
	local holder = frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Parent = refs.indicators,
	})
	local bar = frame({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0),
		Size = UDim2.fromOffset(80, 8),
		BackgroundColor3 = C.bad,
		Parent = holder,
	}, { Ui.corner(4) })
	table.insert(indicators, { holder = holder, bar = bar, from = position, time = os.clock() })
	if #indicators > 5 then
		table.remove(indicators, 1).holder:Destroy()
	end
end

function Hud.killfeed(entry)
	local killer = entry.killer
	local row = frame({
		Size = UDim2.fromOffset(340, 24),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.35,
		AutomaticSize = Enum.AutomaticSize.None,
		LayoutOrder = -math.floor(os.clock() * 100),
		Parent = refs.killfeed,
	}, { Ui.corner(4) })
	local text
	local weapon = entry.weapon or ""
	if entry.headshot then
		weapon ..= " ◎"
	end
	local function hex(color)
		return string.format(
			"#%02X%02X%02X",
			math.floor(color.R * 255),
			math.floor(color.G * 255),
			math.floor(color.B * 255)
		)
	end
	local victim = string.format('<font color="%s">%s</font>', hex(Ui.teamColor(entry.victimTeam)), entry.victim or "?")
	if killer then
		text = string.format(
			'<font color="%s">%s</font>  <font color="#B8B8A8">[%s]</font>  %s',
			hex(Ui.teamColor(entry.killerTeam)),
			killer,
			weapon,
			victim
		)
	else
		text = string.format('%s  <font color="#B8B8A8">[%s]</font>', victim, weapon)
	end
	label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.new(1, -16, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Right,
		RichText = true,
		TextSize = 14,
		Text = text,
		Parent = row,
	})
	table.insert(killRows, { row = row, time = os.clock() })
	if #killRows > 5 then
		table.remove(killRows, 1).row:Destroy()
	end
end

function Hud.popup(amount, text)
	local row = label({
		Size = UDim2.fromOffset(320, 20),
		TextXAlignment = Enum.TextXAlignment.Center,
		RichText = true,
		TextSize = 16,
		LayoutOrder = math.floor(os.clock() * 100),
		Text = string.format('<font color="#DEB85C">+%d</font>  %s', amount, text or ""),
		Parent = refs.popups,
	}, { Ui.textStroke(0.3) })
	table.insert(popups, { row = row, time = os.clock() })
	if #popups > 5 then
		table.remove(popups, 1).row:Destroy()
	end
end

function Hud.announce(text, color)
	refs.announce.Text = text
	refs.announce.TextColor3 = color or C.text
	refs.announce.Visible = true
	announceUntil = os.clock() + 3.5
end

function Hud.banner(title, text, seconds)
	refs.bannerTitle.Text = title
	refs.bannerText.Text = text or ""
	refs.banner.Visible = true
	bannerUntil = os.clock() + (seconds or 3)
end

local function updateCrosshair(d, s)
	local show = d.alive and d.weapon ~= nil and d.aim < 0.6 and not d.scoped
	refs.crosshair.Visible = show
	if not show then
		return
	end
	local melee = d.weapon.melee
	-- Dağılma açısını ekran pikseline çevir
	local fov = math.rad(d.fov)
	local half = d.viewportY / 2
	local gap = math.tan(math.rad(d.spread)) / math.tan(fov / 2) * half / s
	gap = math.clamp(gap, 3, 120) + 3
	local alpha = melee and 1 or math.clamp(d.aim * 2, 0, 1)
	for _, line in ipairs(refs.crossLines) do
		line.Visible = not melee
		line.Position = UDim2.fromOffset(line:GetAttribute("DX") * (gap + 4), line:GetAttribute("DY") * (gap + 4))
		line.BackgroundTransparency = alpha
	end
	refs.crossDot.Visible = true
end

local function updateIndicators(d, now)
	for index = #indicators, 1, -1 do
		local item = indicators[index]
		local age = now - item.time
		if age > 1.4 then
			item.holder:Destroy()
			table.remove(indicators, index)
		else
			local offset = item.from - d.cameraCFrame.Position
			local flat = Vector3.new(offset.X, 0, offset.Z)
			if flat.Magnitude > 0.1 then
				local look = d.cameraCFrame.LookVector
				local right = d.cameraCFrame.RightVector
				local angle = math.atan2(
					flat.Unit:Dot(Vector3.new(right.X, 0, right.Z).Unit),
					flat.Unit:Dot(Vector3.new(look.X, 0, look.Z).Unit)
				)
				item.holder.Rotation = math.deg(angle)
			end
			item.bar.BackgroundTransparency = math.clamp(age / 1.4, 0, 1)
		end
	end
end

local function radarDot(index)
	local dot = radarDots[index]
	if not dot then
		dot = frame({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Size = UDim2.fromOffset(8, 8),
			Parent = refs.radar,
		}, { Ui.round() })
		radarDots[index] = dot
	end
	return dot
end

local function updateRadar(d)
	local radar = d.radar
	local used = 0
	if radar and d.cameraCFrame then
		local look = d.cameraCFrame.LookVector
		local forward = Vector3.new(look.X, 0, look.Z)
		if forward.Magnitude < 0.01 then
			forward = Vector3.new(0, 0, -1)
		end
		forward = forward.Unit
		local right = Vector3.new(-forward.Z, 0, forward.X)
		local range = 130
		for _, blip in ipairs(radar.blips) do
			local offset = blip.position - radar.origin
			local x = offset:Dot(right) / range
			local y = -offset:Dot(forward) / range
			if x * x + y * y < 1 then
				used += 1
				local dot = radarDot(used)
				dot.Visible = true
				dot.Position = UDim2.fromScale(0.5 + x * 0.5, 0.5 + y * 0.5)
				dot.BackgroundColor3 = blip.color
				dot.Size = blip.big and UDim2.fromOffset(14, 14) or UDim2.fromOffset(8, 8)
				dot.BackgroundTransparency = blip.fade or 0
			end
		end
	end
	for index = used + 1, #radarDots do
		radarDots[index].Visible = false
	end
end

local function updateTop(d)
	local state = d.state
	local myTeam = d.teamId
	refs.timer.Text = d.timeText
	refs.modeLine.Text = state.modeShort or ""
	if state.ffa then
		refs.left.box.Visible = false
		refs.right.box.Visible = false
		refs.subLine.Text = state.ffaLine or ""
	else
		refs.left.box.Visible = true
		refs.right.box.Visible = true
		local mine = myTeam or "Sahin"
		local other = mine == "Sahin" and "Ejder" or "Sahin"
		refs.left.score.Text = tostring(state.scores[mine] or 0)
		refs.right.score.Text = tostring(state.scores[other] or 0)
		refs.left.stripe.BackgroundColor3 = Ui.teamColor(mine)
		refs.right.stripe.BackgroundColor3 = Ui.teamColor(other)
		refs.left.name.Text = state.teamNames[mine] or ""
		refs.right.name.Text = state.teamNames[other] or ""
		refs.subLine.Text = state.target and state.target > 0 and ("Hedef " .. state.target) or ""
	end

	local points = d.points
	refs.points.Visible = points ~= nil
	if points then
		for letter, box in pairs(refs.pointBoxes) do
			local info = points[letter]
			box.box.Visible = info ~= nil
			if info then
				local color = info.owner ~= "" and Ui.teamColor(info.owner) or C.text
				box.stroke.Color = info.contested and C.accent or color
				box.text.TextColor3 = color
				box.progress.Size = UDim2.fromOffset(26 * info.progress, 4)
				box.progress.BackgroundColor3 = info.capTeam ~= "" and Ui.teamColor(info.capTeam) or C.text
				box.box.BackgroundTransparency = info.inside and 0 or 0.25
				box.box.BackgroundColor3 = info.inside and C.panel2 or C.ink
			end
		end
	end
end

local function fadeLists(now)
	for index = #killRows, 1, -1 do
		local item = killRows[index]
		if now - item.time > 7 then
			item.row:Destroy()
			table.remove(killRows, index)
		end
	end
	for index = #popups, 1, -1 do
		local item = popups[index]
		local age = now - item.time
		if age > 2.4 then
			item.row:Destroy()
			table.remove(popups, index)
		elseif age > 1.8 then
			item.row.TextTransparency = (age - 1.8) / 0.6
		end
	end
	if refs.announce.Visible and now > announceUntil then
		refs.announce.Visible = false
	end
	if refs.banner.Visible and now > bannerUntil then
		refs.banner.Visible = false
	end
end

-- d: Main'in her kare topladığı durum
function Hud.update(d)
	if not gui or not gui.Enabled then
		return
	end
	local now = os.clock()
	local s = Hud.scale()

	updateCrosshair(d, s)
	refs.hit.Visible = now < hitUntil
	if hitKill and now >= hitUntil then
		hitKill = false
	end
	refs.scope.Visible = d.scoped == true

	-- Can
	local health = math.max(0, math.floor(d.health + 0.5))
	refs.healthText.Text = tostring(health)
	refs.healthFill.Size = UDim2.fromScale(math.clamp(d.health / d.maxHealth, 0, 1), 1)
	refs.healthFill.BackgroundColor3 = d.health < 35 and C.bad or C.text
	local hurt = math.clamp(1 - d.health / d.maxHealth, 0, 1)
	local pulse = 0.82 - hurt * 0.5 + (hurt > 0.6 and math.sin(now * 6) * 0.06 or 0)
	for _, side in ipairs(refs.vignette:GetChildren()) do
		side.BackgroundTransparency = hurt < 0.25 and 1 or pulse
	end

	-- Cephane
	local weapon = d.weapon
	if weapon then
		refs.weaponName.Text = weapon.name
		if weapon.melee then
			refs.ammoMag.Text = "—"
			refs.ammoReserve.Text = ""
		else
			refs.ammoMag.Text = tostring(weapon.mag)
			refs.ammoMag.TextColor3 = weapon.mag <= math.max(1, math.floor(weapon.magSize * 0.25)) and C.bad or C.text
			refs.ammoReserve.Text = "/ " .. weapon.reserve
		end
		refs.ammoInfo.Text = weapon.mode .. "   ·   El bombası " .. d.grenades
	end
	refs.reloadBar.Visible = d.reload ~= nil
	if d.reload then
		refs.reloadFill.Size = UDim2.fromScale(math.clamp(d.reload, 0, 1), 1)
	end
	refs.prompt.Text = d.prompt or ""

	updateTop(d)
	updateIndicators(d, now)
	updateRadar(d)
	fadeLists(now)
end

return Hud
